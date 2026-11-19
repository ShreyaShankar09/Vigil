import re
import secrets
from pathlib import Path
from typing import Literal

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: Literal["dev", "prod"] = "dev"
    database_url: str = "sqlite:///./narcotrace-dev.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    strip_exif_gps: bool = False
    jwt_secret: SecretStr | None = None
    data_key_hex: str | None = None

    @field_validator("jwt_secret", mode="before")
    @classmethod
    def empty_jwt_secret_is_missing(cls, value: str | None) -> str | None:
        return value or None

    @field_validator("jwt_secret")
    @classmethod
    def validate_jwt_secret(cls, value: SecretStr | None) -> SecretStr | None:
        if value is not None and len(value.get_secret_value()) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters")
        return value

    @field_validator("data_key_hex", mode="before")
    @classmethod
    def empty_data_key_is_missing(cls, value: str | None) -> str | None:
        return value or None

    @field_validator("data_key_hex")
    @classmethod
    def validate_data_key(cls, value: str | None) -> str | None:
        if value is not None and re.fullmatch(r"[0-9a-fA-F]{64}", value) is None:
            raise ValueError("DATA_KEY_HEX must contain exactly 64 hexadecimal characters")
        return value

    @model_validator(mode="after")
    def require_production_secrets(self) -> "Settings":
        if self.env == "prod":
            missing = [
                name
                for name, value in (
                    ("JWT_SECRET", self.jwt_secret),
                    ("DATA_KEY_HEX", self.data_key_hex),
                )
                if value is None
            ]
            if missing:
                raise ValueError(f"{', '.join(missing)} must be set when ENV=prod")
        return self


def _persist_generated_secrets(env_file: Path, generated: dict[str, str]) -> None:
    existing = env_file.read_text(encoding="utf-8").splitlines() if env_file.exists() else []
    keys = set(generated)
    lines = [line for line in existing if line.partition("=")[0].strip() not in keys]
    lines.extend(f"{key}={value}" for key, value in generated.items())
    env_file.write_text("\n".join(lines) + "\n", encoding="utf-8")


def load_settings(env_file: Path = ENV_FILE) -> Settings:
    current = Settings(_env_file=env_file)
    generated: dict[str, str] = {}
    jwt_secret = current.jwt_secret
    data_key_hex = current.data_key_hex

    if current.env == "dev":
        if jwt_secret is None:
            jwt_secret = SecretStr(secrets.token_urlsafe(48))
            generated["JWT_SECRET"] = jwt_secret.get_secret_value()
        if data_key_hex is None:
            data_key_hex = secrets.token_hex(32)
            generated["DATA_KEY_HEX"] = data_key_hex
        if generated:
            _persist_generated_secrets(env_file, generated)

    return Settings(
        _env_file=env_file,
        jwt_secret=jwt_secret,
        data_key_hex=data_key_hex,
    )


settings = load_settings()
