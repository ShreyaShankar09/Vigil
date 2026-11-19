from datetime import datetime, timezone
from io import BytesIO

import pytest
from PIL import Image
from sqlalchemy.orm import Session

from app import custody, security
from app.models import AuditLog, CustodyEvent, Evidence, Officer

READ_ENDPOINTS = {
    "detail": "/evidence/{id}",
    "image": "/evidence/{id}/image",
    "custody": "/evidence/{id}/custody",
    "verify": "/evidence/{id}/verify",
    "form6": "/evidence/{id}/form6.pdf",
}
ROLES = ("field_officer", "lab", "zonal_admin", "prosecutor")
OBJECTS = (
    ("own", "NT-OWN", "OFF-OWNER", "North", False),
    ("same_zone_other", "NT-SAME", "OFF-OTHER", "North", False),
    ("other_zone_released", "NT-SOUTH", "OFF-SOUTH", "South", True),
    ("same_zone_released", "NT-RELEASED", "OFF-OTHER", "North", True),
)


def _image() -> bytes:
    output = BytesIO()
    Image.new("RGB", (16, 16), "blue").save(output, "JPEG")
    return output.getvalue()


def _seed_matrix(engine) -> None:
    officers = (
        ("OFF-OWNER", "field_officer", "North"),
        ("OFF-OTHER", "field_officer", "North"),
        ("OFF-SOUTH", "field_officer", "South"),
        ("OFF-LAB", "lab", "North"),
        ("OFF-ADMIN", "zonal_admin", "North"),
        ("OFF-PROSECUTOR", "prosecutor", "North"),
    )
    image = _image()
    with Session(engine) as session:
        for officer_id, role, zone in officers:
            session.add(
                Officer(
                    officer_id=officer_id,
                    name=officer_id,
                    role=role,
                    zone=zone,
                    password_hash="unused",
                )
            )
        for evidence_id, owner_id, zone, released in (
            ("NT-OWN", "OFF-OWNER", "North", False),
            ("NT-SAME", "OFF-OTHER", "North", False),
            ("NT-SOUTH", "OFF-SOUTH", "South", True),
            ("NT-RELEASED", "OFF-OTHER", "North", True),
        ):
            payload = {
                "label": "Sealed",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "actor": "Zoë Ångström",
                "location": "North",
                "gpsVerified": True,
            }
            session.add(
                Evidence(
                    id=evidence_id,
                    case_id=f"CASE-{evidence_id}",
                    officer_id=owner_id,
                    zone=zone,
                    released=released,
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
                    location="North",
                    device_id="test-device",
                    image_sha256=custody.sha256_hex(image),
                    image_stored_sha256=custody.sha256_hex(image),
                    image_enc=security.encrypt(image),
                    extra={},
                )
            )
            session.flush()
            session.add(
                CustodyEvent(
                    evidence_id=evidence_id,
                    seq=0,
                    payload=payload,
                    prev_hash=custody.GENESIS,
                    hash=custody.link_hash(custody.GENESIS, payload),
                )
            )
        session.commit()


def _expected(role: str, owner: str, zone: str, released: bool) -> int:
    if role == "field_officer":
        return 200 if owner == "OFF-OWNER" else 403
    if role in {"lab", "zonal_admin"}:
        return 200 if zone == "North" else 403
    return 200 if released else 403


@pytest.mark.parametrize("endpoint", READ_ENDPOINTS)
@pytest.mark.parametrize("role", ROLES)
@pytest.mark.parametrize(
    ("object_name", "evidence_id", "owner", "zone", "released"),
    OBJECTS,
    ids=[obj[0] for obj in OBJECTS],
)
def test_evidence_read_endpoints_follow_role_and_object_matrix(
    api_client, endpoint, role, object_name, evidence_id, owner, zone, released
):
    client, engine = api_client
    _seed_matrix(engine)
    officer_id = {
        "field_officer": "OFF-OWNER",
        "lab": "OFF-LAB",
        "zonal_admin": "OFF-ADMIN",
        "prosecutor": "OFF-PROSECUTOR",
    }[role]
    token = security.make_access_token(officer_id)
    url = READ_ENDPOINTS[endpoint].format(id=evidence_id)

    response = client.get(url, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == _expected(role, owner, zone, released), (
        endpoint,
        role,
        object_name,
    )
    if endpoint == "image" and response.status_code == 200:
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["content-type"].startswith("image/jpeg")


@pytest.mark.parametrize(
    ("role", "expected_ids"),
    [
        ("field_officer", {"NT-OWN"}),
        ("lab", {"NT-OWN", "NT-SAME", "NT-RELEASED"}),
        ("zonal_admin", {"NT-OWN", "NT-SAME", "NT-RELEASED"}),
        ("prosecutor", {"NT-SOUTH", "NT-RELEASED"}),
    ],
)
def test_evidence_list_is_scoped_by_role(api_client, role, expected_ids):
    client, engine = api_client
    _seed_matrix(engine)
    officer_id = {
        "field_officer": "OFF-OWNER",
        "lab": "OFF-LAB",
        "zonal_admin": "OFF-ADMIN",
        "prosecutor": "OFF-PROSECUTOR",
    }[role]

    response = client.get(
        "/evidence",
        headers={"Authorization": f"Bearer {security.make_access_token(officer_id)}"},
    )

    assert response.status_code == 200
    assert {item["id"] for item in response.json()["items"]} == expected_ids
    assert response.json()["total"] == len(expected_ids)


def test_evidence_list_filters_and_pagination(api_client):
    client, engine = api_client
    _seed_matrix(engine)
    token = security.make_access_token("OFF-ADMIN")

    filtered = client.get(
        "/evidence",
        headers={"Authorization": f"Bearer {token}"},
        params={
            "verdict": "positive",
            "case_id": "CASE-NT-SAME",
            "captured_from": "2025-01-01T00:00:00Z",
            "sync_state": "synced",
            "limit": 1,
        },
    )
    empty_pending = client.get(
        "/evidence",
        headers={"Authorization": f"Bearer {token}"},
        params={"sync_state": "pending"},
    )
    invalid_range = client.get(
        "/evidence",
        headers={"Authorization": f"Bearer {token}"},
        params={
            "captured_from": "2026-01-02T00:00:00Z",
            "captured_to": "2026-01-01T00:00:00Z",
        },
    )

    assert filtered.status_code == 200
    assert filtered.json()["total"] == 1
    assert [item["id"] for item in filtered.json()["items"]] == ["NT-SAME"]
    assert filtered.json()["items"][0]["captured_at"].endswith("+00:00")
    assert empty_pending.json()["total"] == 0
    assert invalid_range.status_code == 422


@pytest.mark.parametrize(
    ("role", "zone", "expected"),
    [
        ("field_officer", "North", 403),
        ("lab", "North", 200),
        ("zonal_admin", "North", 403),
        ("prosecutor", "North", 403),
        ("lab", "South", 403),
    ],
)
def test_only_same_zone_labs_append_custody(api_client, role, zone, expected):
    client, engine = api_client
    _seed_matrix(engine)
    officer_id = f"OFF-APPEND-{role}-{zone}"
    with Session(engine) as session:
        session.add(
            Officer(
                officer_id=officer_id,
                name="Lab User",
                role=role,
                zone=zone,
                password_hash="unused",
            )
        )
        session.commit()

    response = client.post(
        "/evidence/NT-OWN/custody",
        headers={"Authorization": f"Bearer {security.make_access_token(officer_id)}"},
        json={"label": "Laboratory Received", "actor": "Spoofed Name", "location": "Lab"},
    )

    assert response.status_code == expected
    if expected == 200:
        with Session(engine) as session:
            event = session.query(CustodyEvent).filter(CustodyEvent.seq == 1).one()
            assert event.payload["actor"] == "Lab User"
            assert event.payload["by"] == officer_id


@pytest.mark.parametrize(
    ("role", "zone", "expected"),
    [
        ("field_officer", "North", 403),
        ("lab", "North", 403),
        ("zonal_admin", "North", 200),
        ("zonal_admin", "South", 403),
        ("prosecutor", "North", 403),
    ],
)
def test_release_is_zonal_admin_only_and_zone_scoped(api_client, role, zone, expected):
    client, engine = api_client
    _seed_matrix(engine)
    officer_id = f"OFF-RELEASE-{role}-{zone}"
    with Session(engine) as session:
        session.add(
            Officer(
                officer_id=officer_id,
                name="Release User",
                role=role,
                zone=zone,
                password_hash="unused",
            )
        )
        session.commit()

    response = client.post(
        "/admin/evidence/NT-OWN/release",
        headers={"Authorization": f"Bearer {security.make_access_token(officer_id)}"},
    )

    assert response.status_code == expected


def test_released_evidence_becomes_visible_to_prosecutors_and_is_audited(api_client):
    client, engine = api_client
    _seed_matrix(engine)
    admin_headers = {
        "Authorization": f"Bearer {security.make_access_token('OFF-ADMIN')}"
    }
    prosecutor_headers = {
        "Authorization": f"Bearer {security.make_access_token('OFF-PROSECUTOR')}"
    }

    released = client.post("/admin/evidence/NT-OWN/release", headers=admin_headers)
    visible = client.get("/evidence/NT-OWN", headers=prosecutor_headers)

    assert released.status_code == 200
    assert visible.status_code == 200
    with Session(engine) as session:
        assert session.query(AuditLog).filter_by(
            action="admin.evidence.released",
            object_id="NT-OWN",
        ).one()


@pytest.mark.parametrize(
    ("role", "expected"),
    [
        ("field_officer", 403),
        ("lab", 403),
        ("zonal_admin", 200),
        ("prosecutor", 403),
    ],
)
def test_dashboard_is_zonal_admin_only(api_client, role, expected):
    client, engine = api_client
    _seed_matrix(engine)
    officer_id = {
        "field_officer": "OFF-OWNER",
        "lab": "OFF-LAB",
        "zonal_admin": "OFF-ADMIN",
        "prosecutor": "OFF-PROSECUTOR",
    }[role]

    response = client.get(
        "/dashboard/summary",
        headers={"Authorization": f"Bearer {security.make_access_token(officer_id)}"},
    )

    assert response.status_code == expected
    if expected == 200:
        assert response.json()["by_verdict"] == {"positive": 3}


@pytest.mark.parametrize(
    ("role", "expected"),
    [
        ("field_officer", 200),
        ("lab", 403),
        ("zonal_admin", 403),
        ("prosecutor", 403),
    ],
)
def test_only_field_officers_can_analyze(api_client, monkeypatch, role, expected):
    client, engine = api_client
    _seed_matrix(engine)
    officer_id = {
        "field_officer": "OFF-OWNER",
        "lab": "OFF-LAB",
        "zonal_admin": "OFF-ADMIN",
        "prosecutor": "OFF-PROSECUTOR",
    }[role]
    monkeypatch.setattr(
        "app.main.classifier.analyze",
        lambda image, kit_id: {
            "verdict": "inconclusive",
            "reasons": [{"code": "LOW_CONFIDENCE", "min": 0.7}],
            "warnings": [],
        },
    )

    response = client.post(
        "/analyze",
        headers={"Authorization": f"Bearer {security.make_access_token(officer_id)}"},
        data={"kit_id": "KIT-COC-04"},
        files={"file": ("sample.jpg", _image(), "image/jpeg")},
    )

    assert response.status_code == expected
    if expected == 200:
        assert response.json()["reasons"] == [{"code": "LOW_CONFIDENCE", "min": 0.7}]
