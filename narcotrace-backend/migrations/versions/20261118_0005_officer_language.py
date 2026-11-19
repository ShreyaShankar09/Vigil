"""Store each officer's preferred UI language."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261118_0005"
down_revision: Union[str, None] = "20261118_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "officers",
        sa.Column("language", sa.String(length=5), server_default="en", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("officers", "language")
