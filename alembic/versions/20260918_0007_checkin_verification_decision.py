"""Store real GPS-verification decisions and awarded points on check-in submissions."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260918_0007"
down_revision: str | None = "20260914_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("ck_submissions_decision", "checkin_submissions", type_="check")
    op.add_column(
        "checkin_submissions",
        sa.Column(
            "risk_codes",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
    )
    op.add_column(
        "checkin_submissions",
        sa.Column("awarded_points", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_check_constraint(
        "ck_submissions_decision",
        "checkin_submissions",
        "decision IN ('pending', 'approved', 'review_required', 'rejected')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_submissions_decision", "checkin_submissions", type_="check")
    op.drop_column("checkin_submissions", "awarded_points")
    op.drop_column("checkin_submissions", "risk_codes")
    op.create_check_constraint(
        "ck_submissions_decision", "checkin_submissions", "decision = 'pending'"
    )
