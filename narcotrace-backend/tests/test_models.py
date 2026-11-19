from datetime import timezone

from app.models import Evidence


def test_evidence_has_required_indexes_and_model_version_capacity():
    indexes = {
        tuple(column.name for column in index.columns)
        for index in Evidence.__table__.indexes
    }

    assert ("officer_id", "captured_at") in indexes
    assert ("case_id",) in indexes
    assert Evidence.__table__.c.model_version.type.length == 80


def test_received_at_default_is_timezone_aware():
    created_at = Evidence.__table__.c.received_at.default.arg(None)

    assert created_at.tzinfo == timezone.utc
