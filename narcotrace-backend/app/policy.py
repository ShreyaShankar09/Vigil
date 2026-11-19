"""Single role/action policy for evidence and zone-scoped operations."""
from typing import Literal

from fastapi import HTTPException
from sqlalchemy import Select

from .models import Evidence, Officer

Scope = Literal["allow", "owner", "zone", "released"]

POLICY: dict[str, dict[str, Scope]] = {
    "field_officer": {
        "analyze": "allow",
        "evidence.create": "allow",
        "evidence.sync": "allow",
        "evidence.read": "owner",
    },
    "lab": {
        "evidence.read": "zone",
        "custody.append": "zone",
    },
    "zonal_admin": {
        "evidence.read": "zone",
        "evidence.release": "zone",
        "dashboard.read": "allow",
        "officer.manage": "zone",
    },
    "prosecutor": {
        "evidence.read": "released",
    },
}


def scope_for(role: str, action: str) -> Scope | None:
    return POLICY.get(role, {}).get(action)


def is_allowed(
    officer: Officer,
    action: str,
    *,
    evidence: Evidence | None = None,
    object_zone: str | None = None,
) -> bool:
    scope = scope_for(officer.role, action)
    if scope == "allow":
        return evidence is None and object_zone is None
    if scope == "owner":
        return evidence is not None and evidence.officer_id == officer.officer_id
    if scope == "zone":
        zone = evidence.zone if evidence is not None else object_zone
        return zone is not None and zone == officer.zone
    if scope == "released":
        return evidence is not None and evidence.released
    return False


def require(
    officer: Officer,
    action: str,
    *,
    evidence: Evidence | None = None,
    object_zone: str | None = None,
) -> None:
    if not is_allowed(officer, action, evidence=evidence, object_zone=object_zone):
        raise HTTPException(status_code=403, detail="Not authorized for this operation")


def scope_evidence_query(query: Select, officer: Officer, action: str) -> Select:
    scope = scope_for(officer.role, action)
    if scope == "owner":
        return query.where(Evidence.officer_id == officer.officer_id)
    if scope == "zone":
        return query.where(Evidence.zone == officer.zone)
    if scope == "released":
        return query.where(Evidence.released.is_(True))
    if scope == "allow":
        return query
    raise HTTPException(status_code=403, detail="Not authorized for this operation")
