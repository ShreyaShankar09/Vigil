"""Add account controls, refresh sessions, login attempts, and audit records.

Revision ID: 20261118_0002
Revises: 20261118_0001
Create Date: 2026-11-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261118_0002"
down_revision: Union[str, None] = "20261118_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "officers",
        sa.Column("is_disabled", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column(
        "officers",
        sa.Column("must_change_password", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.execute(sa.text("UPDATE officers SET must_change_password = true"))

    op.create_table(
        "login_attempts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("officer_id", sa.String(length=80), nullable=False),
        sa.Column("ip", sa.String(length=45), nullable=False),
        sa.Column("succeeded", sa.Boolean(), nullable=False),
        sa.Column("rate_limited", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_login_attempts_officer_window",
        "login_attempts",
        ["officer_id", "succeeded", "rate_limited", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_login_attempts_ip_window",
        "login_attempts",
        ["ip", "succeeded", "rate_limited", "created_at"],
        unique=False,
    )

    op.create_table(
        "refresh_tokens",
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("officer_id", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["officer_id"], ["officers.officer_id"]),
        sa.PrimaryKeyConstraint("token_hash"),
    )
    op.create_index(
        "ix_refresh_tokens_officer_revoked",
        "refresh_tokens",
        ["officer_id", "revoked_at"],
        unique=False,
    )

    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("who", sa.String(length=160), nullable=False),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("object", sa.String(length=160), nullable=False),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ip", sa.String(length=45), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_log_who_at", "audit_log", ["who", "at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_audit_log_who_at", table_name="audit_log")
    op.drop_table("audit_log")
    op.drop_index("ix_refresh_tokens_officer_revoked", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_index("ix_login_attempts_ip_window", table_name="login_attempts")
    op.drop_index("ix_login_attempts_officer_window", table_name="login_attempts")
    op.drop_table("login_attempts")
    op.drop_column("officers", "must_change_password")
    op.drop_column("officers", "is_disabled")
