"""NarcoTrace backend (FastAPI). Run: uvicorn app.main:app --reload."""
import base64
import binascii
import logging
import math
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

from alembic import command
from alembic.config import Config
import jwt
from fastapi import (
    Cookie,
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from . import audit, custody as ch, policy, security as sec
from .auth import get_current_user, officer_response, request_ip
from .config import settings
from .db import db
from .images import MAX_IMAGE_BYTES, sniff_image_media_type, validate_image, strip_gps_exif
from .models import Evidence, LoginAttempt, Officer, RefreshToken, CustodyEvent
from .form6 import build_form6
from .ml import classifier, kits as kit_charts

logger = logging.getLogger(__name__)
LOGIN_WINDOW = timedelta(minutes=15)
MAX_OFFICER_FAILURES = 5
MAX_IP_FAILURES = 10
REFRESH_COOKIE = "refresh_token"

@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.env == "dev":
        alembic_config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
        command.upgrade(alembic_config, "head")
    yield


app = FastAPI(title="NarcoTrace API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


class LoginIn(BaseModel):
    officer_id: str = Field(min_length=1, max_length=80)
    password: str

    @field_validator("officer_id")
    @classmethod
    def strip_officer_id(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Officer ID is required")
        return value


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str


class ProfilePatch(BaseModel):
    language: Literal["en", "hi", "kn", "ta", "te", "ml", "mr", "bn", "gu", "pa", "or", "as", "ur"]


class OfficerCreate(BaseModel):
    officer_id: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=100)
    role: Literal["field_officer", "zonal_admin", "lab", "prosecutor"] = "field_officer"
    zone: str | None = Field(default=None, max_length=80)
    password: str

    @field_validator("officer_id", "name")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field is required")
        return value

    @field_validator("zone")
    @classmethod
    def strip_zone(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @model_validator(mode="after")
    def validate_password(self) -> "OfficerCreate":
        sec.validate_password(self.password, self.officer_id)
        return self


class OfficerRegister(BaseModel):
    officer_id: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=100)
    role: Literal["field_officer"] = "field_officer"
    language: Literal["en", "hi", "kn", "ta", "te", "ml", "mr", "bn", "gu", "pa", "or", "as", "ur"] = "en"
    zone: str = Field(default="Bengaluru", min_length=1, max_length=80)
    password: str

    @field_validator("officer_id", "name", "zone")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field is required")
        return value

    @model_validator(mode="after")
    def validate_password(self) -> "OfficerRegister":
        sec.validate_password(self.password, self.officer_id)
        return self


class OfficerPatch(BaseModel):
    disabled: bool | None = None
    temporary_password: str | None = None
    must_change_password: bool | None = None

    @model_validator(mode="after")
    def require_an_update(self) -> "OfficerPatch":
        if (
            self.disabled is None
            and self.temporary_password is None
            and self.must_change_password is None
        ):
            raise ValueError("Provide at least one officer update")
        return self


def _failure_times(
    session: Session,
    *,
    field: str,
    value: str,
    limit: int,
    now: datetime,
) -> list[datetime]:
    column = getattr(LoginAttempt, field)
    return list(
        session.scalars(
            select(LoginAttempt.created_at)
            .where(
                column == value,
                LoginAttempt.succeeded.is_(False),
                LoginAttempt.rate_limited.is_(False),
                LoginAttempt.created_at >= now - LOGIN_WINDOW,
            )
            .order_by(LoginAttempt.created_at)
            .limit(limit)
        ).all()
    )


def _retry_after(session: Session, officer_id: str, ip: str, now: datetime) -> int | None:
    deadlines = []
    for field, value, limit in (
        ("officer_id", officer_id, MAX_OFFICER_FAILURES),
        ("ip", ip, MAX_IP_FAILURES),
    ):
        failures = _failure_times(session, field=field, value=value, limit=limit, now=now)
        if len(failures) == limit:
            oldest = failures[0]
            if oldest.tzinfo is None:
                oldest = oldest.replace(tzinfo=timezone.utc)
            deadlines.append(oldest + LOGIN_WINDOW)
    if not deadlines:
        return None
    return max(1, math.ceil((max(deadlines) - now).total_seconds()))


def _record_login_attempt(
    session: Session,
    *,
    officer_id: str,
    ip: str,
    succeeded: bool,
    rate_limited: bool = False,
) -> None:
    session.add(
        LoginAttempt(
            officer_id=officer_id,
            ip=ip,
            succeeded=succeeded,
            rate_limited=rate_limited,
            created_at=datetime.now(timezone.utc),
        )
    )


def _add_refresh_token(session: Session, officer_id: str) -> str:
    token, expires_at = sec.make_refresh_token(officer_id)
    session.add(
        RefreshToken(
            token_hash=sec.token_digest(token),
            officer_id=officer_id,
            expires_at=expires_at,
        )
    )
    return token


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=int(sec.REFRESH_TOKEN_TTL.total_seconds()),
        path="/auth",
        httponly=True,
        secure=settings.env == "prod",
        samesite="strict",
    )


def _delete_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        REFRESH_COOKIE,
        path="/auth",
        httponly=True,
        secure=settings.env == "prod",
        samesite="strict",
    )


def _token_response(officer: Officer) -> dict[str, str | bool | int]:
    return {
        "token": sec.make_access_token(officer.officer_id),
        "token_type": "bearer",
        "expires_in": int(sec.ACCESS_TOKEN_TTL.total_seconds()),
        **officer_response(officer),
    }


@app.post("/auth/register", status_code=201)
def register(
    body: OfficerRegister,
    request: Request,
    session: Session = Depends(db),
):
    if session.get(Officer, body.officer_id):
        raise HTTPException(status_code=409, detail="Officer ID already exists")
    officer = Officer(
        officer_id=body.officer_id,
        name=body.name,
        role=body.role,
        zone=body.zone,
        language=body.language,
        password_hash=sec.pwd.hash(body.password),
        must_change_password=False,
    )
    session.add(officer)
    audit.record_audit(
        session,
        who=officer.officer_id,
        action="officer.registered",
        object_id=officer.officer_id,
        ip=request_ip(request),
    )
    session.commit()
    return officer_response(officer)


@app.post("/auth/login")
def login(
    body: LoginIn,
    request: Request,
    response: Response,
    session: Session = Depends(db),
):
    officer_id = body.officer_id.casefold()
    ip = request_ip(request)
    now = datetime.now(timezone.utc)
    retry_after = _retry_after(session, officer_id, ip, now)
    if retry_after is not None:
        _record_login_attempt(
            session,
            officer_id=officer_id,
            ip=ip,
            succeeded=False,
            rate_limited=True,
        )
        audit.record_audit(
            session,
            who=f"unauthenticated:{officer_id}",
            action="auth.login.throttled",
            object_id=officer_id,
            ip=ip,
        )
        session.commit()
        raise HTTPException(
            status_code=429,
            detail="Too many failed login attempts",
            headers={"Retry-After": str(retry_after)},
        )

    officer = session.get(Officer, body.officer_id)
    if officer is not None and officer.is_disabled:
        _record_login_attempt(session, officer_id=officer_id, ip=ip, succeeded=False)
        audit.record_audit(
            session,
            who=f"unauthenticated:{officer_id}",
            action="auth.login.disabled",
            object_id=officer_id,
            ip=ip,
        )
        session.commit()
        raise HTTPException(status_code=403, detail={"code": "ACCOUNT_DISABLED"})
    password_valid = (
        officer is not None
        and sec.pwd.verify(body.password, officer.password_hash)
    )
    if not password_valid or officer is None:
        _record_login_attempt(session, officer_id=officer_id, ip=ip, succeeded=False)
        audit.record_audit(
            session,
            who=f"unauthenticated:{officer_id}",
            action="auth.login.failure",
            object_id=officer_id,
            ip=ip,
        )
        session.commit()
        raise HTTPException(status_code=401, detail="Bad credentials")

    _record_login_attempt(session, officer_id=officer_id, ip=ip, succeeded=True)
    refresh_token = _add_refresh_token(session, officer.officer_id)
    audit.record_audit(
        session,
        who=officer.officer_id,
        action="auth.login.success",
        object_id=officer.officer_id,
        ip=ip,
    )
    session.commit()
    _set_refresh_cookie(response, refresh_token)
    return _token_response(officer)


@app.post("/auth/refresh")
def refresh(
    request: Request,
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
    session: Session = Depends(db),
):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh cookie required")
    try:
        claims = sec.read_token(refresh_token)
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token") from exc

    officer_id = claims.get("sub")
    if claims.get("type") != "refresh" or not isinstance(officer_id, str):
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    officer = session.get(Officer, officer_id)
    now = datetime.now(timezone.utc)
    token_hash = sec.token_digest(refresh_token)
    if officer is None or officer.is_disabled:
        session.execute(
            update(RefreshToken)
            .where(RefreshToken.officer_id == officer_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        session.commit()
        raise HTTPException(status_code=401, detail="Invalid or disabled account")

    result = session.execute(
        update(RefreshToken)
        .where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.officer_id == officer_id,
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )
    if result.rowcount != 1:
        session.execute(
            update(RefreshToken)
            .where(RefreshToken.officer_id == officer_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        audit.record_audit(
            session,
            who=officer_id,
            action="auth.refresh.replay",
            object_id=officer_id,
            ip=request_ip(request),
        )
        session.commit()
        raise HTTPException(status_code=401, detail="Refresh token has already been used")

    new_refresh_token = _add_refresh_token(session, officer_id)
    audit.record_audit(
        session,
        who=officer_id,
        action="auth.refresh",
        object_id=officer_id,
        ip=request_ip(request),
    )
    session.commit()
    _set_refresh_cookie(response, new_refresh_token)
    return _token_response(officer)


@app.post("/auth/change-password")
def change_password(
    body: PasswordChangeIn,
    request: Request,
    response: Response,
    officer: Officer = Depends(get_current_user),
    session: Session = Depends(db),
):
    if not sec.pwd.verify(body.current_password, officer.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    try:
        sec.validate_password(body.new_password, officer.officer_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    officer.password_hash = sec.pwd.hash(body.new_password)
    officer.must_change_password = False
    now = datetime.now(timezone.utc)
    session.execute(
        update(RefreshToken)
        .where(RefreshToken.officer_id == officer.officer_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    audit.record_audit(
        session,
        who=officer.officer_id,
        action="auth.password.changed",
        object_id=officer.officer_id,
        ip=request_ip(request),
    )
    session.commit()
    _delete_refresh_cookie(response)
    return {"ok": True}


@app.post("/auth/logout")
def logout(
    request: Request,
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
    officer: Officer = Depends(get_current_user),
    session: Session = Depends(db),
):
    if refresh_token:
        session.execute(
            update(RefreshToken)
            .where(
                RefreshToken.token_hash == sec.token_digest(refresh_token),
                RefreshToken.officer_id == officer.officer_id,
                RefreshToken.revoked_at.is_(None),
            )
            .values(revoked_at=datetime.now(timezone.utc))
        )
    audit.record_audit(
        session,
        who=officer.officer_id,
        action="auth.logout",
        object_id=officer.officer_id,
        ip=request_ip(request),
    )
    session.commit()
    _delete_refresh_cookie(response)
    return {"ok": True}


@app.get("/me")
def current_user_profile(officer: Officer = Depends(get_current_user)):
    return officer_response(officer)


@app.patch("/me")
def update_current_user_profile(
    body: ProfilePatch,
    request: Request,
    officer: Officer = Depends(get_current_user),
    session: Session = Depends(db),
):
    officer.language = body.language
    audit.record_audit(
        session,
        who=officer.officer_id,
        action="profile.language.updated",
        object_id=officer.officer_id,
        ip=request_ip(request),
    )
    session.commit()
    return officer_response(officer)


@app.post("/admin/officers", status_code=201)
def create_officer(
    body: OfficerCreate,
    request: Request,
    admin: Officer = Depends(get_current_user),
    session: Session = Depends(db),
):
    policy.require(admin, "officer.manage", object_zone=admin.zone)
    if session.get(Officer, body.officer_id):
        raise HTTPException(status_code=409, detail="Officer ID already exists")
    target_zone = admin.zone if body.zone is None else body.zone
    policy.require(admin, "officer.manage", object_zone=target_zone)
    officer = Officer(
        officer_id=body.officer_id,
        name=body.name,
        role=body.role,
        zone=target_zone,
        password_hash=sec.pwd.hash(body.password),
        must_change_password=True,
    )
    session.add(officer)
    audit.record_audit(
        session,
        who=admin.officer_id,
        action="admin.officer.created",
        object_id=officer.officer_id,
        ip=request_ip(request),
    )
    session.commit()
    return officer_response(officer)


@app.get("/admin/officers")
def list_officers(
    request: Request,
    admin: Officer = Depends(get_current_user),
    session: Session = Depends(db),
):
    policy.require(admin, "officer.manage", object_zone=admin.zone)
    officers = session.scalars(
        select(Officer).where(Officer.zone == admin.zone).order_by(Officer.officer_id)
    ).all()
    audit.record_audit(
        session,
        who=admin.officer_id,
        action="admin.officers.listed",
        object_id="officers",
        ip=request_ip(request),
    )
    session.commit()
    return [officer_response(officer) for officer in officers]


@app.patch("/admin/officers/{officer_id}")
def update_officer(
    officer_id: str,
    body: OfficerPatch,
    request: Request,
    admin: Officer = Depends(get_current_user),
    session: Session = Depends(db),
):
    policy.require(admin, "officer.manage", object_zone=admin.zone)
    officer = session.get(Officer, officer_id)
    if officer is None:
        raise HTTPException(status_code=404, detail="Officer not found")
    policy.require(admin, "officer.manage", object_zone=officer.zone)
    if body.temporary_password is not None:
        try:
            sec.validate_password(body.temporary_password, officer.officer_id)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        officer.password_hash = sec.pwd.hash(body.temporary_password)
        officer.must_change_password = True
    elif body.must_change_password is not None:
        officer.must_change_password = body.must_change_password
    if body.disabled is not None:
        officer.is_disabled = body.disabled
    if body.disabled is True or body.temporary_password is not None:
        session.execute(
            update(RefreshToken)
            .where(RefreshToken.officer_id == officer.officer_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=datetime.now(timezone.utc))
        )
    audit.record_audit(
        session,
        who=admin.officer_id,
        action="admin.officer.updated",
        object_id=officer.officer_id,
        ip=request_ip(request),
    )
    session.commit()
    return officer_response(officer)


@app.get("/model/info")
def model_info(user: Officer = Depends(get_current_user)):
    """What model is running and how far it has (not) been validated - shown in the app so nobody over-trusts it."""
    return classifier.model_info()


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/kits")
def list_kits(user: Officer = Depends(get_current_user)):
    return [{"id": k, "reagent": v["reagent"], "expected": sorted(set(v["expected"].values())), "chart_verified": v["chart_verified"],
             "read_window_s": v["read_window_s"]} for k, v in kit_charts.KITS.items()]


@app.post("/analyze")
async def analyze(
    request: Request,
    file: UploadFile = File(...),
    kit_id: str = Form(...),
    seconds_since_reagent: float | None = Form(default=None, ge=0),
    user: Officer = Depends(get_current_user),
    session: Session = Depends(db),
):
    """Stateless: photo -> reference-card calibration -> colour CNN -> kit-specific verdict. Nothing is stored here;
    the officer's device keeps the image and sends it with /sync/evidence once the evidence record is sealed."""
    policy.require(user, "analyze")
    audit.record_audit(
        session,
        who=user.officer_id,
        action="evidence.analyze",
        object_id=kit_id,
        ip=request_ip(request),
    )
    session.commit()
    if kit_id not in kit_charts.KITS:
        raise HTTPException(422, detail={"code": "UNKNOWN_KIT"})
    data = await file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(
            413,
            detail={"code": "IMAGE_TOO_LARGE", "max_bytes": MAX_IMAGE_BYTES},
        )
    if sniff_image_media_type(data) is None:
        raise HTTPException(
            415,
            detail={"code": "UNSUPPORTED_IMAGE_TYPE"},
        )
    try:
        validate_image(data)
    except ValueError as exc:
        raise HTTPException(422, detail={"code": "IMAGE_DECODE_FAILED"}) from exc
    try:
        result = classifier.analyze(data, kit_id)
    except ValueError as exc:
        logger.warning("Image analysis failed: %s", exc)
        raise HTTPException(422, detail={"code": "IMAGE_ANALYSIS_FAILED"}) from exc
    read_window = result.get("kit", {}).get("read_window_s")
    if read_window is not None and seconds_since_reagent is not None and seconds_since_reagent > read_window:
        result["verdict"] = "inconclusive"
        result["substance"] = "Undetermined"
        result.setdefault("reasons", []).append({"code": "READ_WINDOW_EXCEEDED", "read_window_s": read_window})
    notices = result.get("reasons", []) + result.get("warnings", [])
    logger.info(
        "Analysis completed for kit %s: %s",
        kit_id,
        [kit_charts.notice_message(notice) for notice in notices],
    )
    return result


class CustodyIn(BaseModel):
    payload: dict      # label, timestamp, actor, location, gpsVerified
    prev_hash: str
    hash: str          # computed ON DEVICE; server recomputes and compares


class EvidenceIn(BaseModel):
    id: str; case_id: str; test_kit_id: str; sample_type: str
    verdict: str; substance: str; confidence: float; reaction_color: str; model_version: str
    captured_at: datetime; lat: float | None = None; lng: float | None = None; location: str = ""
    temperature_c: float | None = None; lighting_lux: float | None = None
    device_id: str; image_sha256: str; image_b64: str = Field(min_length=1)
    custody: list[CustodyIn]; extra: dict = Field(default_factory=dict)

    @field_validator("captured_at")
    @classmethod
    def captured_at_must_be_timezone_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("captured_at must include a timezone")
        return value.astimezone(timezone.utc)


def _evidence_response(evidence: Evidence) -> dict:
    return {
        "id": evidence.id,
        "case_id": evidence.case_id,
        "officer_id": evidence.officer_id,
        "zone": evidence.zone,
        "test_kit_id": evidence.test_kit_id,
        "sample_type": evidence.sample_type,
        "verdict": evidence.verdict,
        "substance": evidence.substance,
        "confidence": evidence.confidence,
        "reaction_color": evidence.reaction_color,
        "model_version": evidence.model_version,
        "captured_at": _as_utc(evidence.captured_at).isoformat(),
        "received_at": _as_utc(evidence.received_at).isoformat(),
        "lat": evidence.lat,
        "lng": evidence.lng,
        "location": evidence.location,
        "temperature_c": evidence.temperature_c,
        "lighting_lux": evidence.lighting_lux,
        "device_id": evidence.device_id,
        "image_sha256": evidence.image_sha256,
        "extra": evidence.extra,
        "released": evidence.released,
        "sync_state": "synced",
    }


def _authorized_evidence(eid: str, user: Officer, session: Session) -> Evidence:
    evidence = session.get(Evidence, eid)
    if evidence is None:
        raise HTTPException(status_code=404, detail="Evidence not found")
    policy.require(user, "evidence.read", evidence=evidence)
    return evidence


def _record_evidence_read(
    session: Session,
    request: Request,
    user: Officer,
    evidence_id: str,
    action: str = "evidence.read",
) -> None:
    audit.record_audit(
        session,
        who=user.officer_id,
        action=action,
        object_id=evidence_id,
        ip=request_ip(request),
    )
    session.commit()


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


@app.get("/evidence")
def list_evidence(
    request: Request,
    verdict: str | None = None,
    case_id: str | None = None,
    captured_from: datetime | None = None,
    captured_to: datetime | None = None,
    sync_state: Literal["synced", "pending", "uploading", "failed"] | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: Officer = Depends(get_current_user),
    session: Session = Depends(db),
):
    start = _as_utc(captured_from) if captured_from is not None else None
    end = _as_utc(captured_to) if captured_to is not None else None
    if start is not None and end is not None and start > end:
        raise HTTPException(status_code=422, detail="captured_from must not be after captured_to")

    query = policy.scope_evidence_query(select(Evidence), user, "evidence.read")
    if verdict is not None:
        query = query.where(Evidence.verdict == verdict)
    if case_id is not None:
        query = query.where(Evidence.case_id == case_id)
    if start is not None:
        query = query.where(Evidence.captured_at >= start)
    if end is not None:
        query = query.where(Evidence.captured_at <= end)
    if sync_state is not None and sync_state != "synced":
        query = query.where(Evidence.id.is_(None))

    total = session.scalar(select(func.count()).select_from(query.subquery())) or 0
    records = session.scalars(
        query.order_by(Evidence.captured_at.desc(), Evidence.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    _record_evidence_read(
        session,
        request,
        user,
        f"evidence:list:{offset}:{limit}",
    )
    return {
        "items": [_evidence_response(record) for record in records],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@app.get("/evidence/{eid}")
def get_evidence(
    eid: str,
    request: Request,
    user: Officer = Depends(get_current_user),
    session: Session = Depends(db),
):
    evidence = _authorized_evidence(eid, user, session)
    _record_evidence_read(session, request, user, eid)
    return _evidence_response(evidence)


@app.get("/evidence/{eid}/image")
def get_evidence_image(
    eid: str,
    request: Request,
    user: Officer = Depends(get_current_user),
    session: Session = Depends(db),
):
    evidence = _authorized_evidence(eid, user, session)
    _record_evidence_read(session, request, user, eid)
    image = sec.decrypt(evidence.image_enc)
    expected_hash = evidence.image_stored_sha256 or evidence.image_sha256
    if ch.sha256_hex(image) != expected_hash:
        raise HTTPException(status_code=409, detail="Evidence image integrity check failed")
    media_type = sniff_image_media_type(image)
    if media_type is None:
        raise HTTPException(status_code=500, detail="Stored evidence image has an invalid format")
    return Response(
        content=image,
        media_type=media_type,
        headers={"Cache-Control": "no-store", "Pragma": "no-cache"},
    )


@app.get("/evidence/{eid}/custody")
def get_evidence_custody(
    eid: str,
    request: Request,
    user: Officer = Depends(get_current_user),
    session: Session = Depends(db),
):
    _authorized_evidence(eid, user, session)
    events = session.scalars(
        select(CustodyEvent)
        .where(CustodyEvent.evidence_id == eid)
        .order_by(CustodyEvent.seq)
    ).all()
    serialized = [
        {
            "id": event.id,
            "seq": event.seq,
            "payload": event.payload,
            "prev_hash": event.prev_hash,
            "hash": event.hash,
        }
        for event in events
    ]
    chain_ok, broken_at = ch.verify_chain(serialized)
    _record_evidence_read(session, request, user, eid)
    return {"events": serialized, "chain_ok": chain_ok, "broken_at": broken_at}


@app.post("/sync/evidence", status_code=201)
def sync_evidence(
    body: EvidenceIn,
    request: Request,
    response: Response,
    user: Officer = Depends(get_current_user),
    s: Session = Depends(db),
):
    """Called by the offline queue. Idempotent: re-sending the same id is a safe no-op."""
    policy.require(user, "evidence.sync")
    existing = s.get(Evidence, body.id)
    if existing is not None:
        policy.require(user, "evidence.read", evidence=existing)
        audit.record_audit(
            s,
            who=user.officer_id,
            action="evidence.sync",
            object_id=body.id,
            ip=request_ip(request),
        )
        s.commit()
        response.status_code = 200
        return {"status": "already_synced"}
    max_encoded_length = ((MAX_IMAGE_BYTES + 2) // 3) * 4
    if len(body.image_b64) > max_encoded_length:
        raise HTTPException(
            status_code=413,
            detail={"code": "IMAGE_TOO_LARGE", "max_bytes": MAX_IMAGE_BYTES},
        )
    try:
        img = base64.b64decode(body.image_b64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail={"code": "INVALID_IMAGE_BASE64"}) from exc
    if len(img) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail={"code": "IMAGE_TOO_LARGE", "max_bytes": MAX_IMAGE_BYTES},
        )
    if sniff_image_media_type(img) is None:
        raise HTTPException(status_code=415, detail={"code": "UNSUPPORTED_IMAGE_TYPE"})
    try:
        validate_image(img)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"code": "IMAGE_DECODE_FAILED"}) from exc
    if ch.sha256_hex(img).casefold() != body.image_sha256.casefold():
        raise HTTPException(status_code=422, detail={"code": "IMAGE_HASH_MISMATCH"})
    ok, bad = ch.verify_chain([c.model_dump() for c in body.custody])
    if not ok:
        raise HTTPException(
            status_code=422,
            detail={"code": "CUSTODY_CHAIN_BROKEN", "event_index": bad},
        )
    stored_image = strip_gps_exif(img) if settings.strip_exif_gps else img
    policy.require(user, "evidence.create")
    ev = Evidence(
        id=body.id, case_id=body.case_id, officer_id=user.officer_id, zone=user.zone,
        test_kit_id=body.test_kit_id,
        sample_type=body.sample_type, verdict=body.verdict, substance=body.substance,
        confidence=body.confidence, reaction_color=body.reaction_color, model_version=body.model_version,
        captured_at=body.captured_at, lat=body.lat, lng=body.lng, location=body.location,
        temperature_c=body.temperature_c, lighting_lux=body.lighting_lux, device_id=body.device_id,
        image_sha256=body.image_sha256.casefold(),
        image_stored_sha256=ch.sha256_hex(stored_image),
        image_enc=sec.encrypt(stored_image),
        extra=body.extra,
    )
    s.add(ev)
    for i, c in enumerate(body.custody):
        s.add(CustodyEvent(evidence_id=body.id, seq=i, payload=c.payload, prev_hash=c.prev_hash, hash=c.hash))
    audit.record_audit(
        s,
        who=user.officer_id,
        action="evidence.sync",
        object_id=body.id,
        ip=request_ip(request),
    )
    s.commit()
    return {"status": "synced"}


class TransferIn(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    actor: str | None = None
    location: str = Field(default="", max_length=120)


@app.post("/evidence/{eid}/custody")
def add_custody(
    eid: str,
    body: TransferIn,
    request: Request,
    user: Officer = Depends(get_current_user),
    s: Session = Depends(db),
):
    """Server-side append (e.g. 'Laboratory Received'); server links the new hash itself."""
    evidence = s.get(Evidence, eid)
    if evidence is None:
        raise HTTPException(status_code=404, detail="Evidence not found")
    policy.require(user, "custody.append", evidence=evidence)
    last = s.scalars(
        select(CustodyEvent)
        .where(CustodyEvent.evidence_id == eid)
        .order_by(CustodyEvent.seq.desc())
    ).first()
    if last is None:
        raise HTTPException(status_code=409, detail="Evidence has no custody chain")
    payload = {
        "label": body.label,
        "actor": user.name,
        "location": body.location,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "by": user.officer_id,
    }
    s.add(
        CustodyEvent(
            evidence_id=eid,
            seq=last.seq + 1,
            payload=payload,
            prev_hash=last.hash,
            hash=ch.link_hash(last.hash, payload),
        )
    )
    audit.record_audit(
        s,
        who=user.officer_id,
        action="evidence.custody.append",
        object_id=eid,
        ip=request_ip(request),
    )
    s.commit()
    return {"ok": True}


@app.post("/admin/evidence/{eid}/release")
def release_evidence(
    eid: str,
    request: Request,
    user: Officer = Depends(get_current_user),
    session: Session = Depends(db),
):
    evidence = session.get(Evidence, eid)
    if evidence is None:
        raise HTTPException(status_code=404, detail="Evidence not found")
    policy.require(user, "evidence.release", evidence=evidence)
    evidence.released = True
    audit.record_audit(
        session,
        who=user.officer_id,
        action="admin.evidence.released",
        object_id=eid,
        ip=request_ip(request),
    )
    session.commit()
    return {"id": eid, "released": True}


@app.get("/evidence/{eid}/verify")
def verify(
    eid: str,
    request: Request,
    user: Officer = Depends(get_current_user),
    s: Session = Depends(db),
):
    ev = _authorized_evidence(eid, user, s)
    _record_evidence_read(s, request, user, eid)
    evs = s.scalars(select(CustodyEvent).where(CustodyEvent.evidence_id == eid).order_by(CustodyEvent.seq)).all()
    ok, bad = ch.verify_chain([{"payload": e.payload, "prev_hash": e.prev_hash, "hash": e.hash} for e in evs])
    expected_hash = ev.image_stored_sha256 or ev.image_sha256
    img_ok = ch.sha256_hex(sec.decrypt(ev.image_enc)) == expected_hash
    return {"chain_ok": ok, "broken_at": bad, "image_ok": img_ok}


@app.get("/evidence/{eid}/form6.pdf")
def form6(
    eid: str,
    request: Request,
    lang: Literal["en", "hi", "kn", "ta", "te", "ml", "mr", "bn", "gu", "pa", "or", "as", "ur"] = "en",
    user: Officer = Depends(get_current_user),
    s: Session = Depends(db),
):
    ev = _authorized_evidence(eid, user, s)
    _record_evidence_read(s, request, user, eid, action="form6.download")
    evs = s.scalars(select(CustodyEvent).where(CustodyEvent.evidence_id == eid).order_by(CustodyEvent.seq)).all()
    ok, _ = ch.verify_chain([{"payload": e.payload, "prev_hash": e.prev_hash, "hash": e.hash} for e in evs])
    off = s.get(Officer, ev.officer_id)
    d = {c.name: getattr(ev, c.name) for c in ev.__table__.columns}
    d.update(
        officer_name=off.name if off else ev.officer_id,
        captured_at=_as_utc(ev.captured_at).isoformat(),
    )
    return Response(build_form6(d, ok, lang), media_type="application/pdf")


@app.get("/dashboard/summary")
def summary(
    request: Request,
    user: Officer = Depends(get_current_user),
    s: Session = Depends(db),
):
    policy.require(user, "dashboard.read")
    audit.record_audit(
        s,
        who=user.officer_id,
        action="evidence.read",
        object_id="dashboard.summary",
        ip=request_ip(request),
    )
    s.commit()
    by_verdict = dict(
        s.execute(
            select(Evidence.verdict, func.count())
            .where(Evidence.zone == user.zone)
            .group_by(Evidence.verdict)
        ).all()
    )
    hotspots = [{"lat": r[0], "lng": r[1], "n": r[2]} for r in s.execute(
        select(func.round(Evidence.lat, 2), func.round(Evidence.lng, 2), func.count())
        .where(
            Evidence.zone == user.zone,
            Evidence.verdict == "positive",
            Evidence.lat.is_not(None),
            Evidence.lng.is_not(None),
        )
        .group_by(func.round(Evidence.lat, 2), func.round(Evidence.lng, 2))).all()]
    return {"by_verdict": by_verdict, "hotspots": hotspots}
