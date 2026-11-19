import os
from datetime import datetime, timezone
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, inspect
from sqlalchemy.orm import Session

from app import security
from app.config import settings
from app.db import db
from app.main import app
from app.models import Evidence, Officer
POSTGRES_TEST_URL = os.getenv("POSTGRES_TEST_URL")


@pytest.mark.skipif(not POSTGRES_TEST_URL, reason="PostgreSQL CI service is not configured")
def test_postgres_schema_migrations(monkeypatch):
    if POSTGRES_TEST_URL is None:
        pytest.skip("PostgreSQL CI service is not configured")
    database_url = POSTGRES_TEST_URL
    monkeypatch.setattr(settings, "database_url", database_url)
    backend_dir = Path(__file__).resolve().parents[1]
    config = Config(str(backend_dir / "alembic.ini"))
    command.upgrade(config, "head")

    engine = create_engine(database_url)
    try:
        inspector = inspect(engine)
        assert {
            "officers",
            "evidence",
            "custody_events",
            "audit_log",
            "refresh_tokens",
        } <= set(inspector.get_table_names())
        assert {
            "zone",
            "released",
            "image_stored_sha256",
        } <= {column["name"] for column in inspector.get_columns("evidence")}

        with Session(engine) as session:
            session.execute(delete(Evidence).where(Evidence.id == "NT-CI-PG"))
            session.execute(delete(Officer).where(Officer.officer_id == "OFF-CI-PG"))
            session.commit()
            officer = Officer(
                officer_id="OFF-CI-PG",
                name="PostgreSQL CI",
                role="field_officer",
                zone="CI",
                password_hash="unused",
            )
            session.add(officer)
            session.flush()
            evidence = Evidence(
                id="NT-CI-PG",
                case_id="CASE-CI-PG",
                officer_id=officer.officer_id,
                zone="CI",
                test_kit_id="KIT-COC-04",
                sample_type="powder",
                verdict="positive",
                substance="Suspected Cocaine",
                confidence=95.0,
                reaction_color="Blue",
                model_version="test",
                captured_at=datetime.now(timezone.utc),
                lat=1.0,
                lng=2.0,
                location="CI",
                device_id="ci-device",
                image_sha256="0" * 64,
                image_enc=b"encrypted-test-image",
                extra={},
            )
            session.add(evidence)
            session.commit()

        def override_db():
            with Session(engine) as session:
                yield session

        app.dependency_overrides[db] = override_db
        try:
            with TestClient(app, base_url="http://testserver") as client:
                response = client.get(
                    "/evidence",
                    headers={
                        "Authorization": f"Bearer {security.make_access_token('OFF-CI-PG')}"
                    },
                )
            assert response.status_code == 200
            assert [record["id"] for record in response.json()["items"]] == ["NT-CI-PG"]
        finally:
            app.dependency_overrides.pop(db, None)
    finally:
        with Session(engine) as session:
            session.execute(delete(Evidence).where(Evidence.id == "NT-CI-PG"))
            session.execute(delete(Officer).where(Officer.officer_id == "OFF-CI-PG"))
            session.commit()
        engine.dispose()
