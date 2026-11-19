"""Add evidence zones, release state, and stored-image integrity hashes.

Revision ID: 20261118_0003
Revises: 20261118_0002
Create Date: 2026-11-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261118_0003"
down_revision: Union[str, None] = "20261118_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "evidence",
        sa.Column("zone", sa.String(length=80), server_default="", nullable=False),
    )
    op.execute(
        sa.text(
            "UPDATE evidence SET zone = COALESCE("
            "(SELECT officers.zone FROM officers WHERE officers.officer_id = evidence.officer_id), '')"
        )
    )
    op.add_column(
        "evidence",
        sa.Column("released", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column(
        "evidence",
        sa.Column("image_stored_sha256", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_evidence_zone_captured_at",
        "evidence",
        ["zone", "captured_at"],
        unique=False,
    )
    op.create_index(
        "ix_evidence_zone_released",
        "evidence",
        ["zone", "released"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_evidence_zone_released", table_name="evidence")
    op.drop_index("ix_evidence_zone_captured_at", table_name="evidence")
    op.drop_column("evidence", "image_stored_sha256")
    op.drop_column("evidence", "released")
    op.drop_column("evidence", "zone")
