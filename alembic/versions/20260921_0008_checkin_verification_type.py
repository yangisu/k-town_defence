"""Record whether a check-in uses demo or actual evidence verification."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260921_0008"
down_revision: str | None = "20260918_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "checkin_sessions",
        sa.Column("verification_type", sa.String(20), nullable=False, server_default="actual"),
    )
    op.create_check_constraint(
        "ck_checkin_sessions_verification_type",
        "checkin_sessions",
        "verification_type IN ('demo', 'actual')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_checkin_sessions_verification_type", "checkin_sessions", type_="check")
    op.drop_column("checkin_sessions", "verification_type")
