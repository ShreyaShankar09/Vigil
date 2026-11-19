"""Bootstrap the first zonal administrator: python -m app.seed --admin."""
import getpass
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import audit, security
from .db import engine
from .models import Officer


def main() -> None:
    if sys.argv[1:] != ["--admin"]:
        raise SystemExit("Usage: python -m app.seed --admin")

    with Session(engine) as session:
        existing_admin = session.scalar(
            select(Officer.officer_id).where(Officer.role == "zonal_admin").limit(1)
        )
        if existing_admin is not None:
            raise SystemExit("A zonal administrator already exists")

        officer_id = input("Admin officer ID: ").strip()
        name = input("Admin name: ").strip()
        zone = input("Zone: ").strip()
        if (
            not officer_id
            or len(officer_id) > 20
            or not name
            or len(name) > 100
            or not zone
            or len(zone) > 80
        ):
            raise SystemExit("Officer ID, name, or zone is invalid")
        if session.get(Officer, officer_id) is not None:
            raise SystemExit("That officer ID already exists")

        password = getpass.getpass("Admin password (10+ characters): ")
        confirmation = getpass.getpass("Confirm admin password: ")
        if password != confirmation:
            raise SystemExit("Passwords do not match")
        try:
            security.validate_password(password, officer_id)
        except ValueError as exc:
            raise SystemExit(str(exc)) from exc

        session.add(
            Officer(
                officer_id=officer_id,
                name=name,
                role="zonal_admin",
                zone=zone,
                password_hash=security.pwd.hash(password),
            )
        )
        audit.record_audit(
            session,
            who=officer_id,
            action="admin.bootstrap",
            object_id=officer_id,
            ip="127.0.0.1",
        )
        session.commit()
        print(f"Zonal administrator {officer_id} created")


if __name__ == "__main__":
    main()
