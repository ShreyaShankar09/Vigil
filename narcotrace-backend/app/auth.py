import jwt
from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from . import security
from .db import db
from .models import Officer

PASSWORD_CHANGE_PATHS = {"/me", "/auth/change-password", "/auth/logout"}


def get_current_user(
    request: Request,
    authorization: str | None = Header(default=None),
    session: Session = Depends(db),
) -> Officer:
    if authorization is None:
        raise HTTPException(
            status_code=401,
            detail="Authorization header required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    scheme, separator, token = authorization.partition(" ")
    if not separator or scheme.casefold() != "bearer" or not token or token.strip() != token or " " in token:
        raise HTTPException(
            status_code=401,
            detail="Malformed Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        claims = security.read_token(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    officer_id = claims.get("sub")
    if claims.get("type") != "access" or not isinstance(officer_id, str):
        raise HTTPException(status_code=401, detail="Invalid access token")

    officer = session.get(Officer, officer_id)
    if officer is None or officer.is_disabled:
        raise HTTPException(status_code=401, detail="Invalid or disabled account")
    if officer.must_change_password and request.url.path not in PASSWORD_CHANGE_PATHS:
        raise HTTPException(status_code=403, detail="Password change required")
    return officer


def request_ip(request: Request) -> str:
    return request.client.host if request.client is not None else "unknown"


def officer_response(officer: Officer) -> dict[str, str | bool]:
    return {
        "officer_id": officer.officer_id,
        "name": officer.name,
        "role": officer.role,
        "zone": officer.zone,
        "language": officer.language,
        "is_disabled": officer.is_disabled,
        "must_change_password": officer.must_change_password,
    }
