import base64
from datetime import datetime, timezone
from io import BytesIO

import pytest
from PIL import ExifTags, Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import custody, security
from app.config import settings
from app.images import MAX_IMAGE_BYTES
from app.models import Evidence, Officer


def _jpeg(with_gps: bool = False) -> bytes:
    output = BytesIO()
    image = Image.new("RGB", (16, 16), "green")
    if with_gps:
        exif = Image.Exif()
        exif[ExifTags.Base.GPSInfo] = {
            ExifTags.GPS.GPSLatitudeRef: "N",
            ExifTags.GPS.GPSLatitude: (1, 2, 3),
        }
        exif[ExifTags.Base.Make] = "TestCam"
        image.save(output, "JPEG", exif=exif)
    else:
        image.save(output, "JPEG")
    return output.getvalue()


def _seed_officer(
    engine,
    role: str = "field_officer",
    zone: str = "North",
    officer_id: str = "OFF-SYNC",
) -> str:
    with Session(engine) as session:
        session.add(
            Officer(
                officer_id=officer_id,
                name="Sync Officer",
                role=role,
                zone=zone,
                password_hash="unused",
            )
        )
        session.commit()
    return security.make_access_token(officer_id)


def _sync_payload(image: bytes, evidence_id: str = "NT-SYNC-01") -> dict:
    payload = {
        "label": "Evidence Sealed",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "actor": "Sync Officer",
        "location": "North",
        "gpsVerified": True,
    }
    return {
        "id": evidence_id,
        "case_id": "CASE-SYNC",
        "test_kit_id": "KIT-COC-04",
        "sample_type": "powder",
        "verdict": "positive",
        "substance": "Suspected Cocaine",
        "confidence": 95.0,
        "reaction_color": "Blue",
        "model_version": "test",
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "lat": 1.0,
        "lng": 2.0,
        "location": "North",
        "device_id": "sync-device",
        "image_sha256": custody.sha256_hex(image),
        "image_b64": base64.b64encode(image).decode("ascii"),
        "custody": [
            {
                "payload": payload,
                "prev_hash": custody.GENESIS,
                "hash": custody.link_hash(custody.GENESIS, payload),
            }
        ],
    }


def _post_sync(client, token: str, payload: dict):
    return client.post(
        "/sync/evidence",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )


def test_sync_is_idempotent_and_records_the_officer_zone(api_client):
    client, engine = api_client
    token = _seed_officer(engine)
    payload = _sync_payload(_jpeg())

    first = _post_sync(client, token, payload)
    repeated = _post_sync(client, token, payload)

    assert first.status_code == 201
    assert repeated.status_code == 200
    assert repeated.json() == {"status": "already_synced"}
    with Session(engine) as session:
        evidence = session.get(Evidence, "NT-SYNC-01")
        assert evidence is not None
        assert evidence.zone == "North"


def test_field_officer_cannot_resync_another_officers_evidence(api_client):
    client, engine = api_client
    owner_token = _seed_officer(engine)
    other_token = _seed_officer(engine, officer_id="OFF-OTHER-SYNC")
    payload = _sync_payload(_jpeg())

    assert _post_sync(client, owner_token, payload).status_code == 201
    forbidden = _post_sync(client, other_token, payload)

    assert forbidden.status_code == 403


def test_sync_rejects_bad_image_hash(api_client):
    client, engine = api_client
    token = _seed_officer(engine)
    payload = _sync_payload(_jpeg())
    payload["image_sha256"] = "0" * 64

    response = _post_sync(client, token, payload)

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "IMAGE_HASH_MISMATCH"


def test_verify_detects_tampered_stored_image(api_client):
    client, engine = api_client
    token = _seed_officer(engine)
    original = _jpeg()
    payload = _sync_payload(original)
    assert _post_sync(client, token, payload).status_code == 201
    tampered_image = BytesIO()
    Image.new("RGB", (16, 16), "red").save(tampered_image, "JPEG")

    with Session(engine) as session:
        evidence = session.get(Evidence, payload["id"])
        assert evidence is not None
        evidence.image_enc = security.encrypt(tampered_image.getvalue())
        session.commit()

    response = client.get(
        f"/evidence/{payload['id']}/verify",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["chain_ok"] is True
    assert response.json()["image_ok"] is False


def test_sync_rejects_a_broken_custody_chain(api_client):
    client, engine = api_client
    token = _seed_officer(engine)
    payload = _sync_payload(_jpeg())
    payload["custody"][0]["hash"] = "0" * 64

    response = _post_sync(client, token, payload)

    assert response.status_code == 422
    assert response.json()["detail"] == {
        "code": "CUSTODY_CHAIN_BROKEN",
        "event_index": 0,
    }


def test_sync_rejects_oversized_images_before_hashing(api_client):
    client, engine = api_client
    token = _seed_officer(engine)
    image = b"\xff\xd8\xff" + b"x" * MAX_IMAGE_BYTES

    response = _post_sync(client, token, _sync_payload(image))

    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "IMAGE_TOO_LARGE"


def test_sync_strips_gps_only_when_configured_and_preserves_original_hash(api_client, monkeypatch):
    client, engine = api_client
    token = _seed_officer(engine)
    image = _jpeg(with_gps=True)
    monkeypatch.setattr(settings, "strip_exif_gps", True)
    payload = _sync_payload(image)

    response = _post_sync(client, token, payload)

    assert response.status_code == 201
    with Session(engine) as session:
        evidence = session.scalar(select(Evidence).where(Evidence.id == "NT-SYNC-01"))
        assert evidence is not None
        stored = security.decrypt(evidence.image_enc)
        assert evidence.image_sha256 == custody.sha256_hex(image)
        assert evidence.image_stored_sha256 == custody.sha256_hex(stored)
        with Image.open(BytesIO(stored)) as stored_image:
            stored_exif = stored_image.getexif()
            assert ExifTags.Base.GPSInfo not in stored_exif
            assert stored_exif[ExifTags.Base.Make] == "TestCam"


def test_sync_keeps_original_image_bytes_by_default(api_client, monkeypatch):
    client, engine = api_client
    token = _seed_officer(engine)
    monkeypatch.setattr(settings, "strip_exif_gps", False)
    image = _jpeg(with_gps=True)

    assert _post_sync(client, token, _sync_payload(image)).status_code == 201
    with Session(engine) as session:
        evidence = session.get(Evidence, "NT-SYNC-01")
        assert evidence is not None
        assert security.decrypt(evidence.image_enc) == image
        assert evidence.image_stored_sha256 == evidence.image_sha256


def test_sync_requires_timezone_aware_capture_time(api_client):
    client, engine = api_client
    token = _seed_officer(engine)
    payload = _sync_payload(_jpeg())
    payload["captured_at"] = "2026-01-01T00:00:00"

    response = _post_sync(client, token, payload)

    assert response.status_code == 422


@pytest.mark.parametrize(
    ("role", "expected"),
    [
        ("field_officer", 201),
        ("lab", 403),
        ("zonal_admin", 403),
        ("prosecutor", 403),
    ],
)
def test_only_field_officers_can_sync_evidence(api_client, role, expected):
    client, engine = api_client
    token = _seed_officer(engine, role=role)

    response = _post_sync(client, token, _sync_payload(_jpeg()))

    assert response.status_code == expected


def test_analyze_returns_machine_notices_and_sniffs_image_bytes(api_client, monkeypatch):
    client, engine = api_client
    token = _seed_officer(engine)
    output = BytesIO()
    Image.new("RGB", (16, 16), "purple").save(output, "PNG")
    monkeypatch.setattr(
        "app.main.classifier.analyze",
        lambda image, kit_id: {
            "verdict": "inconclusive",
            "reasons": [{"code": "LOW_CONFIDENCE", "min": 0.7}],
            "warnings": [{"code": "CALIBRATION_RESIDUAL_HIGH", "max_delta_e": 12}],
        },
    )

    response = client.post(
        "/analyze",
        headers={"Authorization": f"Bearer {token}"},
        data={"kit_id": "KIT-COC-04"},
        files={"file": ("sample.jpg", output.getvalue(), "image/jpeg")},
    )

    assert response.status_code == 200
    assert response.json()["reasons"] == [{"code": "LOW_CONFIDENCE", "min": 0.7}]
    assert response.json()["warnings"] == [{"code": "CALIBRATION_RESIDUAL_HIGH", "max_delta_e": 12}]
    assert "message" not in response.json()["reasons"][0]


def test_analyze_rejects_unsupported_magic_bytes(api_client):
    client, engine = api_client
    token = _seed_officer(engine)

    response = client.post(
        "/analyze",
        headers={"Authorization": f"Bearer {token}"},
        data={"kit_id": "KIT-COC-04"},
        files={"file": ("sample.jpg", b"not an image", "image/jpeg")},
    )

    assert response.status_code == 415
    assert response.json()["detail"]["code"] == "UNSUPPORTED_IMAGE_TYPE"


def test_analyze_rejects_oversized_upload(api_client):
    client, engine = api_client
    token = _seed_officer(engine)
    image = b"\xff\xd8\xff" + b"x" * MAX_IMAGE_BYTES

    response = client.post(
        "/analyze",
        headers={"Authorization": f"Bearer {token}"},
        data={"kit_id": "KIT-COC-04"},
        files={"file": ("sample.jpg", image, "image/jpeg")},
    )

    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "IMAGE_TOO_LARGE"
