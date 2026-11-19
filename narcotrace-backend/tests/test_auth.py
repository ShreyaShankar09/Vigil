import base64
from datetime import datetime, timezone
from io import BytesIO

import pytest
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import custody, security
from app.models import AuditLog, Evidence, LoginAttempt, Officer


def add_officer(
    engine,
    officer_id: str,
    password: str = "secure-password",
    role: str = "field_officer",
    must_change_password: bool = False,
    zone: str = "Test",
) -> None:
    with Session(engine) as session:
        session.add(
            Officer(
                officer_id=officer_id,
                name="Test Officer",
                role=role,
                zone=zone,
                password_hash=security.pwd.hash(password),
                must_change_password=must_change_password,
            )
        )
        session.commit()


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def jpeg_bytes() -> bytes:
    output = BytesIO()
    Image.new("RGB", (16, 16), "red").save(output, format="JPEG")
    return output.getvalue()


@pytest.mark.parametrize("authorization", [None, "Bearer", "Basic abc", "Bearer one two"])
def test_missing_or_malformed_authorization_returns_401(api_client, authorization):
    client, _ = api_client
    headers = {} if authorization is None else {"Authorization": authorization}

    assert client.get("/model/info", headers=headers).status_code == 401
    assert client.get("/evidence", headers=headers).status_code == 401


def test_officer_language_can_be_updated_on_profile(api_client):
    client, engine = api_client
    add_officer(engine, "OFF-LANGUAGE")
    login_response = client.post(
        "/auth/login",
        json={"officer_id": "OFF-LANGUAGE", "password": "secure-password"},
    )
    headers = bearer(login_response.json()["token"])

    update = client.patch("/me", json={"language": "ur"}, headers=headers)
    assert update.status_code == 200
    assert update.json()["language"] == "ur"
    assert client.get("/me", headers=headers).json()["language"] == "ur"
    assert client.patch("/me", json={"language": "en-XA"}, headers=headers).status_code == 422


def test_login_issues_short_access_token_and_rotating_http_only_refresh_cookie(api_client):
    client, engine = api_client
    add_officer(engine, "OFF-2001")

    login_response = client.post(
        "/auth/login",
        json={"officer_id": "OFF-2001", "password": "secure-password"},
    )
    assert login_response.status_code == 200
    access_token = login_response.json()["token"]
    claims = security.read_token(access_token)
    assert claims["type"] == "access"
    assert claims["exp"] - claims["iat"] == 15 * 60
    cookie_header = login_response.headers["set-cookie"].lower()
    assert "httponly" in cookie_header
    assert "samesite=strict" in cookie_header
    old_refresh_token = client.cookies.get("refresh_token")
    assert old_refresh_token

    refresh_response = client.post("/auth/refresh")
    assert refresh_response.status_code == 200
    assert client.cookies.get("refresh_token") != old_refresh_token
    logout_response = client.post(
        "/auth/logout",
        headers=bearer(refresh_response.json()["token"]),
    )
    assert logout_response.status_code == 200
    assert client.post("/auth/refresh").status_code == 401

    client.cookies.clear()
    client.cookies.set("refresh_token", old_refresh_token, path="/auth")
    replay_response = client.post("/auth/refresh")
    assert replay_response.status_code == 401


def test_disabled_account_login_returns_machine_readable_error_and_audit(api_client):
    client, engine = api_client
    add_officer(engine, "OFF-DISABLED")
    with Session(engine) as session:
        officer = session.get(Officer, "OFF-DISABLED")
        assert officer is not None
        officer.is_disabled = True
        session.commit()

    response = client.post(
        "/auth/login",
        json={"officer_id": "OFF-DISABLED", "password": "secure-password"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == {"code": "ACCOUNT_DISABLED"}
    with Session(engine) as session:
        attempt = session.scalar(select(LoginAttempt).where(LoginAttempt.officer_id == "off-disabled"))
        assert attempt is not None and not attempt.succeeded
        assert session.scalar(
            select(AuditLog).where(AuditLog.action == "auth.login.disabled")
        ) is not None


def test_password_change_required_and_password_policy(api_client):
    client, engine = api_client
    add_officer(engine, "OFF-2002", must_change_password=True)
    token = security.make_access_token("OFF-2002")

    assert client.get("/model/info", headers=bearer(token)).status_code == 403
    profile = client.get("/me", headers=bearer(token))
    assert profile.status_code == 200
    assert profile.json()["must_change_password"] is True

    rejected = client.post(
        "/auth/change-password",
        headers=bearer(token),
        json={"current_password": "secure-password", "new_password": "OFF-2002"},
    )
    assert rejected.status_code == 422

    changed = client.post(
        "/auth/change-password",
        headers=bearer(token),
        json={"current_password": "secure-password", "new_password": "new-secure-password"},
    )
    assert changed.status_code == 200
    assert client.get("/model/info", headers=bearer(token)).status_code == 200
    with Session(engine) as session:
        officer = session.get(Officer, "OFF-2002")
        assert officer is not None
        assert security.pwd.verify("new-secure-password", officer.password_hash)
        assert not officer.must_change_password


def test_officer_login_limit_records_attempts_and_retry_after(api_client):
    client, engine = api_client

    for _ in range(5):
        response = client.post(
            "/auth/login",
            json={"officer_id": "OFF-LOCKED", "password": "incorrect"},
        )
        assert response.status_code == 401
    officer_limited = client.post(
        "/auth/login",
        json={"officer_id": "OFF-LOCKED", "password": "incorrect"},
    )
    assert officer_limited.status_code == 429
    assert int(officer_limited.headers["Retry-After"]) > 0


    with Session(engine) as session:
        attempts = session.scalars(select(LoginAttempt)).all()
        assert sum(attempt.rate_limited for attempt in attempts) == 1
        assert session.scalar(select(AuditLog).where(AuditLog.action == "auth.login.failure")) is not None
        assert session.scalar(select(AuditLog).where(AuditLog.action == "auth.login.throttled")) is not None


def test_ip_login_limit_records_attempts_and_retry_after(api_client):
    client, engine = api_client
    for index in range(10):
        response = client.post(
            "/auth/login",
            json={"officer_id": f"UNKNOWN-{index}", "password": "incorrect"},
        )
        assert response.status_code == 401
    ip_limited = client.post(
        "/auth/login",
        json={"officer_id": "UNKNOWN-LAST", "password": "incorrect"},
    )
    assert ip_limited.status_code == 429
    assert int(ip_limited.headers["Retry-After"]) > 0

    with Session(engine) as session:
        attempts = session.scalars(select(LoginAttempt)).all()
        assert sum(attempt.rate_limited for attempt in attempts) == 1
        assert session.scalar(select(AuditLog).where(AuditLog.action == "auth.login.failure")) is not None
        assert session.scalar(select(AuditLog).where(AuditLog.action == "auth.login.throttled")) is not None


def test_only_zonal_admins_can_provision_and_reset_officers(api_client):
    client, engine = api_client
    add_officer(engine, "OFF-ADMIN", role="zonal_admin")
    add_officer(engine, "OFF-FIELD")
    admin_token = security.make_access_token("OFF-ADMIN")
    field_token = security.make_access_token("OFF-FIELD")
    payload = {
        "officer_id": "OFF-NEW",
        "name": "New Officer",
        "password": "initial-password",
    }

    assert client.post("/admin/officers", json=payload).status_code == 401
    forbidden = client.post(
        "/admin/officers",
        headers=bearer(field_token),
        json=payload,
    )
    assert forbidden.status_code == 403

    created = client.post(
        "/admin/officers",
        headers=bearer(admin_token),
        json=payload,
    )
    assert created.status_code == 201
    assert created.json()["must_change_password"] is True
    assert created.json()["role"] == "field_officer"
    assert created.json().get("password_hash") is None
    listed = client.get("/admin/officers", headers=bearer(admin_token))
    assert listed.status_code == 200
    assert any(officer["officer_id"] == "OFF-NEW" for officer in listed.json())

    reset = client.patch(
        "/admin/officers/OFF-NEW",
        headers=bearer(admin_token),
        json={"temporary_password": "reset-password", "disabled": True},
    )
    assert reset.status_code == 200
    assert reset.json()["is_disabled"] is True
    enabled = client.patch(
        "/admin/officers/OFF-NEW",
        headers=bearer(admin_token),
        json={"disabled": False},
    )
    assert enabled.json()["must_change_password"] is True

    with Session(engine) as session:
        created_officer = session.get(Officer, "OFF-NEW")
        assert created_officer is not None
        assert created_officer.password_hash.startswith("$2b$12$")
        actions = set(session.scalars(select(AuditLog.action)).all())
        assert {"admin.officer.created", "admin.officers.listed", "admin.officer.updated"} <= actions


def test_officer_management_is_limited_to_admin_zone(api_client):
    client, engine = api_client
    add_officer(engine, "OFF-ADMIN-ZONE", role="zonal_admin", zone="North")
    add_officer(engine, "OFF-IN-ZONE", zone="North")
    add_officer(engine, "OFF-OUT-ZONE", zone="South")
    token = security.make_access_token("OFF-ADMIN-ZONE")

    created = client.post(
        "/admin/officers",
        headers=bearer(token),
        json={
            "officer_id": "OFF-CREATED-ZONE",
            "name": "Created in North",
            "password": "initial-password",
        },
    )
    outside_create = client.post(
        "/admin/officers",
        headers=bearer(token),
        json={
            "officer_id": "OFF-CREATED-SOUTH",
            "name": "Created in South",
            "zone": "South",
            "password": "initial-password",
        },
    )
    listed = client.get("/admin/officers", headers=bearer(token))
    outside_patch = client.patch(
        "/admin/officers/OFF-OUT-ZONE",
        headers=bearer(token),
        json={"disabled": True},
    )

    assert created.status_code == 201
    assert created.json()["zone"] == "North"
    assert outside_create.status_code == 403
    assert {officer["officer_id"] for officer in listed.json()} == {
        "OFF-ADMIN-ZONE",
        "OFF-IN-ZONE",
        "OFF-CREATED-ZONE",
    }
    assert outside_patch.status_code == 403


def test_evidence_actions_write_audit_records(api_client, monkeypatch):
    client, engine = api_client
    add_officer(engine, "OFF-EVIDENCE")
    add_officer(engine, "OFF-LAB", role="lab")
    token = security.make_access_token("OFF-EVIDENCE")
    lab_token = security.make_access_token("OFF-LAB")
    monkeypatch.setattr(
        "app.main.classifier.analyze",
        lambda image, kit_id: {"verdict": "positive", "kit_id": kit_id},
    )
    analyzed = client.post(
        "/analyze",
        headers=bearer(token),
        data={"kit_id": "KIT-COC-04"},
        files={"file": ("sample.jpg", jpeg_bytes(), "text/plain")},
    )
    assert analyzed.status_code == 200

    image = jpeg_bytes()
    payload = {
        "label": "Sealed",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "actor": "OFF-EVIDENCE",
        "location": "Test",
        "gpsVerified": True,
    }
    custody_event = {
        "payload": payload,
        "prev_hash": custody.GENESIS,
        "hash": custody.link_hash(custody.GENESIS, payload),
    }
    synced = client.post(
        "/sync/evidence",
        headers=bearer(token),
        json={
            "id": "NT-TEST-01",
            "case_id": "CASE-TEST",
            "test_kit_id": "KIT-COC-04",
            "sample_type": "powder",
            "verdict": "positive",
            "substance": "cocaine",
            "confidence": 95.0,
            "reaction_color": "blue",
            "model_version": "test",
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "lat": 0.0,
            "lng": 0.0,
            "device_id": "test-device",
            "image_sha256": custody.sha256_hex(image),
            "image_b64": base64.b64encode(image).decode("ascii"),
            "custody": [custody_event],
        },
    )
    assert synced.status_code == 201
    appended = client.post(
        "/evidence/NT-TEST-01/custody",
        headers=bearer(lab_token),
        json={"label": "Received", "actor": "Lab", "location": "Test"},
    )
    assert appended.status_code == 200
    assert client.get("/evidence/NT-TEST-01/verify", headers=bearer(token)).status_code == 200
    assert client.get("/evidence/NT-TEST-01/form6.pdf", headers=bearer(token)).status_code == 200

    with Session(engine) as session:
        actions = set(session.scalars(select(AuditLog.action)).all())
        assert {
            "evidence.analyze",
            "evidence.sync",
            "evidence.custody.append",
            "evidence.read",
            "form6.download",
        } <= actions


def test_officer_registration_and_login(api_client):
    client, engine = api_client
    res = client.post(
        "/auth/register",
        json={
            "officer_id": "OFF-REG-01",
            "name": "Registered Officer",
            "role": "field_officer",
            "zone": "Bengaluru",
            "language": "kn",
            "password": "Secure-Password-2026",
        },
    )
    assert res.status_code == 201
    payload = res.json()
    assert payload["officer_id"] == "OFF-REG-01"
    assert payload["role"] == "field_officer"
    assert payload["language"] == "kn"
    assert payload["must_change_password"] is False
    assert "token" not in payload  # does not directly sign in

    # Duplicate registration fails
    dup = client.post(
        "/auth/register",
        json={
            "officer_id": "OFF-REG-01",
            "name": "Duplicate Officer",
            "role": "field_officer",
            "zone": "Bengaluru",
            "language": "en",
            "password": "Secure-Password-2026",
        },
    )
    assert dup.status_code == 409

    # Password validation
    short = client.post(
        "/auth/register",
        json={
            "officer_id": "OFF-REG-02",
            "name": "Short Pass",
            "role": "lab",
            "zone": "Bengaluru",
            "language": "hi",
            "password": "short",
        },
    )
    assert short.status_code == 422

    # Now login with the newly registered account
    login = client.post(
        "/auth/login",
        json={"officer_id": "OFF-REG-01", "password": "Secure-Password-2026"},
    )
    assert login.status_code == 200
    login_payload = login.json()
    assert login_payload["token_type"] == "bearer"
    assert login_payload["language"] == "kn"
    assert login_payload["must_change_password"] is False

