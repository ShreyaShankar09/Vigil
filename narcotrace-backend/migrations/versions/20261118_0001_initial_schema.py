"""Create the initial NarcoTrace schema.

Revision ID: 20261118_0001
Revises:
Create Date: 2026-11-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261118_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "officers",
        sa.Column("officer_id", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("zone", sa.String(length=80), nullable=False),
        sa.Column("password_hash", sa.String(length=100), nullable=False),
        sa.PrimaryKeyConstraint("officer_id"),
    )
    op.create_table(
        "evidence",
        sa.Column("id", sa.String(length=20), nullable=False),
        sa.Column("case_id", sa.String(length=40), nullable=False),
        sa.Column("officer_id", sa.String(length=20), nullable=False),
        sa.Column("test_kit_id", sa.String(length=30), nullable=False),
        sa.Column("sample_type", sa.String(length=100), nullable=False),
        sa.Column("verdict", sa.String(length=15), nullable=False),
        sa.Column("substance", sa.String(length=80), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("reaction_color", sa.String(length=40), nullable=False),
        sa.Column("model_version", sa.String(length=80), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
        sa.Column("location", sa.String(length=120), nullable=False),
        sa.Column("temperature_c", sa.Float(), nullable=True),
        sa.Column("lighting_lux", sa.Float(), nullable=True),
        sa.Column("device_id", sa.String(length=40), nullable=False),
        sa.Column("image_sha256", sa.String(length=64), nullable=False),
        sa.Column("image_enc", sa.LargeBinary(), nullable=False),
        sa.Column("extra", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["officer_id"], ["officers.officer_id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_evidence_case_id", "evidence", ["case_id"], unique=False)
    op.create_index(
        "ix_evidence_officer_id_captured_at",
        "evidence",
        ["officer_id", "captured_at"],
        unique=False,
    )
    op.create_table(
        "custody_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("evidence_id", sa.String(length=20), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("prev_hash", sa.String(length=64), nullable=False),
        sa.Column("hash", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["evidence_id"], ["evidence.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_custody_events_evidence_id", "custody_events", ["evidence_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_custody_events_evidence_id", table_name="custody_events")
    op.drop_table("custody_events")
    op.drop_index("ix_evidence_officer_id_captured_at", table_name="evidence")
    op.drop_index("ix_evidence_case_id", table_name="evidence")
    op.drop_table("evidence")
    op.drop_table("officers")
