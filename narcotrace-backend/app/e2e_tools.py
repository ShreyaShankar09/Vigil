"""Guarded database mutations used only to exercise integrity alerts in E2E."""
from __future__ import annotations

import os
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import security
from .config import settings
from .db import engine
from .models import CustodyEvent, Evidence


def main() -> None:
    if os.getenv("E2E_MUTATIONS_ENABLED") != "1" or settings.env != "dev":
        raise SystemExit("E2E database mutations are disabled")
    if len(sys.argv) != 3 or sys.argv[1] not in {"tamper-image", "tamper-custody"}:
        raise SystemExit("Usage: python -m app.e2e_tools tamper-image|tamper-custody E2E-ID")
    action, evidence_id = sys.argv[1:]
    if not evidence_id.startswith("E2E-"):
        raise SystemExit("Only E2E-prefixed records can be mutated")

    with Session(engine) as session:
        evidence = session.get(Evidence, evidence_id)
        if evidence is None:
            raise SystemExit(f"E2E evidence not found: {evidence_id}")
        if action == "tamper-image":
            evidence.image_enc = security.encrypt(b"tampered test image bytes")
        else:
            event = session.scalar(
                select(CustodyEvent)
                .where(CustodyEvent.evidence_id == evidence_id)
                .order_by(CustodyEvent.seq)
                .limit(1)
            )
            if event is None:
                raise SystemExit(f"E2E custody event not found: {evidence_id}")
            event.payload = {**event.payload, "actor": "tampered test actor"}
        session.commit()
    print(f"Tampered {action} for {evidence_id}")


if __name__ == "__main__":
    main()
