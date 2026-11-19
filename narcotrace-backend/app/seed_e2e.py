"""Seed deterministic accounts and evidence for the compose-backed browser suite."""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from hashlib import sha256
from io import BytesIO

from PIL import Image
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from . import custody, security
from .config import settings
from .db import engine
from .models import CustodyEvent, Evidence, LoginAttempt, Officer, RefreshToken

PASSWORD = "E2E-Password-2026"
OFFICERS = (
    ("ZONAL-E2E-1", "E2E Administrator", "zonal_admin", "Bengaluru"),
    ("OFF-E2E-001", "E2E Officer", "field_officer", "Bengaluru"),
    ("OFF-E2E-002", "E2E Other Officer", "field_officer", "Bengaluru"),
    ("OFF-E2E-LOCK", "E2E Lockout Officer", "field_officer", "Bengaluru"),
    ("LAB-E2E-001", "E2E Laboratory Officer", "lab", "Bengaluru"),
    ("PROS-E2E-01", "E2E Prosecutor", "prosecutor", "Bengaluru"),
)
OFFICER_IDS = tuple(officer[0] for officer in OFFICERS)


def _tiny_png() -> bytes:
    output = BytesIO()
    Image.new("RGB", (8, 8), (20, 90, 180)).save(output, "PNG")
    return output.getvalue()


def _add_evidence(session: Session, evidence_id: str, owner: str, *, released: bool = False) -> None:
    image = _tiny_png()
    now = datetime.now(timezone.utc)
    evidence = Evidence(
        id=evidence_id,
        case_id=f"CASE-{evidence_id}",
        officer_id=owner,
        zone="Bengaluru",
        released=released,
        test_kit_id="KIT-COC-04",
        sample_type="powder",
        verdict="positive",
        substance="Suspected Cocaine",
        confidence=95.0,
        reaction_color="Blue",
        model_version="E2E fixture",
        captured_at=now,
        location="Bengaluru",
        device_id="e2e-device",
        image_sha256=sha256(image).hexdigest(),
        image_stored_sha256=sha256(image).hexdigest(),
        image_enc=security.encrypt(image),
        extra={},
    )
    session.add(evidence)
    session.flush()
    payload = {
        "label": "Evidence Captured",
        "timestamp": now.isoformat(),
        "actor": "Zoë காவல்",
        "location": "Bengaluru",
        "gpsVerified": False,
    }
    session.add(
        CustodyEvent(
            evidence_id=evidence_id,
            seq=0,
            payload=payload,
            prev_hash=custody.GENESIS,
            hash=custody.link_hash(custody.GENESIS, payload),
        )
    )


def _reset(session: Session) -> None:
    officer_id_filter = or_(
        Officer.officer_id.in_(OFFICER_IDS),
        Officer.officer_id.like("E2E-NEW-%"),
    )
    evidence_filter = or_(Evidence.id.like("E2E-%"), Evidence.case_id.like("E2E-%"))
    evidence_ids = select(Evidence.id).where(evidence_filter)
    session.execute(delete(CustodyEvent).where(CustodyEvent.evidence_id.in_(evidence_ids)))
    session.execute(delete(Evidence).where(evidence_filter))
    session.execute(
        delete(RefreshToken).where(
            or_(
                RefreshToken.officer_id.in_(OFFICER_IDS),
                RefreshToken.officer_id.like("E2E-NEW-%"),
            )
        )
    )
    session.execute(
        delete(LoginAttempt).where(
            or_(
                LoginAttempt.officer_id.in_([value.casefold() for value in OFFICER_IDS]),
                LoginAttempt.officer_id.like("e2e-new-%"),
            )
        )
    )
    session.execute(delete(Officer).where(officer_id_filter))


def main() -> None:
    if sys.argv[1:] != ["--reset"]:
        raise SystemExit("Usage: python -m app.seed_e2e --reset")
    if os.getenv("E2E_SEED_ALLOW_RESET") != "1" or settings.env != "dev":
        raise SystemExit("E2E reset requires E2E_SEED_ALLOW_RESET=1 and ENV=dev")

    with Session(engine) as session:
        _reset(session)
        for officer_id, name, role, zone in OFFICERS:
            session.add(
                Officer(
                    officer_id=officer_id,
                    name=name,
                    role=role,
                    zone=zone,
                    password_hash=security.pwd.hash(PASSWORD),
                )
            )
        session.flush()
        _add_evidence(session, "E2E-OWN-0001", "OFF-E2E-001")
        _add_evidence(session, "E2E-OTHER-01", "OFF-E2E-002")
        _add_evidence(session, "E2E-REL-0001", "OFF-E2E-002", released=True)
        _add_evidence(session, "E2E-TAMPER-I", "OFF-E2E-001")
        _add_evidence(session, "E2E-TAMPER-C", "OFF-E2E-001")
        session.commit()
    print("Seeded E2E roles and evidence: " + ", ".join(OFFICER_IDS))


if __name__ == "__main__":
    main()
