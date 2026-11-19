"""Allow evidence captures without a GPS fix."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261118_0004"
down_revision: Union[str, None] = "20261118_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("evidence") as batch:
        batch.alter_column("lat", existing_type=sa.Float(), nullable=True)
        batch.alter_column("lng", existing_type=sa.Float(), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table("evidence") as batch:
        batch.alter_column("lat", existing_type=sa.Float(), nullable=False)
        batch.alter_column("lng", existing_type=sa.Float(), nullable=False)
