from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .models import AuditLog


def record_audit(
    session: Session,
    *,
    who: str,
    action: str,
    object_id: str,
    ip: str,
) -> None:
    session.add(
        AuditLog(
            who=who,
            action=action,
            object_id=object_id,
            at=datetime.now(timezone.utc),
            ip=ip,
        )
    )
