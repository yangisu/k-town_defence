"""Add optional social profile fields to users."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260913_0005"
down_revision: str | None = "20260822_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("display_name", sa.String(120)))
    op.add_column("users", sa.Column("avatar_url", sa.String(500)))


def downgrade() -> None:
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "display_name")
