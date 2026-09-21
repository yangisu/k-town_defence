"""Keep tutorial check-ins in the pipeline without scoring them."""
from collections.abc import Sequence
from alembic import op
import sqlalchemy as sa
revision: str = "20260921_0011"
down_revision: str | None = "20260921_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
def upgrade() -> None:
    op.add_column("checkin_sessions", sa.Column("is_practice", sa.Boolean(), nullable=False, server_default=sa.false()))
def downgrade() -> None:
    op.drop_column("checkin_sessions", "is_practice")
