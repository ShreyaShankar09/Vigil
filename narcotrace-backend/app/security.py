import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import settings

if settings.jwt_secret is None or settings.data_key_hex is None:
    raise RuntimeError("JWT_SECRET and DATA_KEY_HEX must be configured")

SECRET = settings.jwt_secret.get_secret_value()
DATA_KEY = bytes.fromhex(settings.data_key_hex)
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)
ROLES = ("field_officer", "zonal_admin", "lab", "prosecutor")  # prosecutor/lab = read-only
ACCESS_TOKEN_TTL = timedelta(minutes=15)
REFRESH_TOKEN_TTL = timedelta(hours=8)


def make_access_token(officer_id: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": officer_id, "type": "access", "iat": now, "exp": now + ACCESS_TOKEN_TTL},
        SECRET,
        "HS256",
    )


def make_refresh_token(officer_id: str) -> tuple[str, datetime]:
    now = datetime.now(timezone.utc)
    expires_at = now + REFRESH_TOKEN_TTL
    token = jwt.encode(
        {
            "sub": officer_id,
            "type": "refresh",
            "jti": secrets.token_urlsafe(24),
            "iat": now,
            "exp": expires_at,
        },
        SECRET,
        "HS256",
    )
    return token, expires_at


def read_token(token: str) -> dict:
    return jwt.decode(token, SECRET, algorithms=["HS256"])


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def validate_password(password: str, officer_id: str) -> None:
    if len(password) < 10:
        raise ValueError("Password must be at least 10 characters")
    if password.casefold() == officer_id.casefold():
        raise ValueError("Password must not equal the officer ID")


# AES-256-GCM for images / sensitive fields at rest. Key = 32 bytes from env/KMS.
def _key() -> bytes:
    return DATA_KEY


def encrypt(data: bytes) -> bytes:
    nonce = os.urandom(12)
    return nonce + AESGCM(_key()).encrypt(nonce, data, None)


def decrypt(blob: bytes) -> bytes:
    return AESGCM(_key()).decrypt(blob[:12], blob[12:], None)
