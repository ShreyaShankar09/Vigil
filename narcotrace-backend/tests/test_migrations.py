from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import settings


def test_upgrade_requires_existing_officers_to_change_password(tmp_path, monkeypatch):
    database_path = (tmp_path / "existing.db").as_posix()
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{database_path}")
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option(
        "script_location",
        str(Path(__file__).resolve().parents[1] / "migrations"),
    )

    command.upgrade(config, "20261118_0001")
    engine = create_engine(settings.database_url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO officers (officer_id, name, role, zone, password_hash) "
                "VALUES ('OFF-OLD', 'Existing Officer', 'field_officer', 'Test', 'hash')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO evidence (id, case_id, officer_id, test_kit_id, sample_type, verdict, "
                "substance, confidence, reaction_color, model_version, captured_at, received_at, "
                "lat, lng, location, device_id, image_sha256, image_enc, extra) VALUES "
                "('NT-OLD', 'CASE-OLD', 'OFF-OLD', 'KIT-COC-04', 'powder', 'positive', "
                "'unknown', 95.0, 'Blue', 'old', '2026-01-01T00:00:00+00:00', "
                "'2026-01-01T00:00:00+00:00', 0.0, 0.0, 'Test', 'old-device', :sha, :image, '{}')"
            ),
            {"sha": "0" * 64, "image": b"old-encrypted-image"},
        )

    command.upgrade(config, "head")
    with engine.connect() as connection:
        must_change_password = connection.scalar(
            text("SELECT must_change_password FROM officers WHERE officer_id = 'OFF-OLD'")
        )
        evidence_zone, released, stored_hash = connection.execute(
            text(
                "SELECT zone, released, image_stored_sha256 FROM evidence WHERE id = 'NT-OLD'"
            )
        ).one()

    assert must_change_password in (1, True)
    assert evidence_zone == "Test"
    assert released in (0, False)
    assert stored_hash is None
    engine.dispose()
