import re

import pytest
from pydantic import ValidationError

from app.config import Settings, load_settings
from app.security import decrypt, encrypt


def test_dev_secrets_are_generated_persisted_and_reused(tmp_path, monkeypatch):
    monkeypatch.setenv("ENV", "dev")
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.delenv("DATA_KEY_HEX", raising=False)
    env_file = tmp_path / ".env"

    first = load_settings(env_file)
    persisted = env_file.read_text(encoding="utf-8")
    second = load_settings(env_file)

    assert first.jwt_secret is not None
    assert len(first.jwt_secret.get_secret_value()) >= 32
    assert first.data_key_hex is not None
    assert re.fullmatch(r"[0-9a-fA-F]{64}", first.data_key_hex)
    assert first.jwt_secret.get_secret_value() in persisted
    assert first.data_key_hex in persisted
    assert second.jwt_secret == first.jwt_secret
    assert second.data_key_hex == first.data_key_hex


def test_generated_data_key_encrypts_and_decrypts():
    plaintext = b"NarcoTrace evidence"

    assert decrypt(encrypt(plaintext)) == plaintext


def test_production_requires_both_secrets(monkeypatch):
    monkeypatch.setenv("ENV", "prod")
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.delenv("DATA_KEY_HEX", raising=False)

    with pytest.raises(ValidationError, match="JWT_SECRET.*DATA_KEY_HEX"):
        Settings(_env_file=None)


def test_gps_stripping_is_disabled_by_default():
    assert Settings(_env_file=None, env="dev").strip_exif_gps is False


@pytest.mark.parametrize(
    ("jwt_secret", "data_key_hex"),
    [
        ("short", "0" * 64),
        ("x" * 32, "z" * 64),
    ],
)
def test_invalid_secrets_are_rejected(jwt_secret, data_key_hex):
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            env="prod",
            jwt_secret=jwt_secret,
            data_key_hex=data_key_hex,
        )
