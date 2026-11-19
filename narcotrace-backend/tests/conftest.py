from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import db
from app.main import app
from app.models import Base


@asynccontextmanager
async def no_migrations(_: FastAPI):
    yield


@pytest.fixture
def api_client(monkeypatch):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)

    def override_db():
        with Session(engine) as session:
            yield session

    monkeypatch.setattr(app.router, "lifespan_context", no_migrations)
    app.dependency_overrides[db] = override_db
    with TestClient(app, base_url="http://testserver") as client:
        yield client, engine
    app.dependency_overrides.clear()
    engine.dispose()
