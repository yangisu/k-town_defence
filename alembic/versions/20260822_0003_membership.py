"""Add durable fandom membership and seed the MVP catalog."""

from collections.abc import Sequence
from datetime import datetime, timezone
from uuid import UUID

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260822_0003"
down_revision: str | None = "20260821_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ARMY_ID = UUID("10000000-0000-4000-8000-000000000001")
BLINK_ID = UUID("10000000-0000-4000-8000-000000000002")
CARAT_ID = UUID("10000000-0000-4000-8000-000000000003")
SEASON_ID = UUID("20000000-0000-4000-8000-000000000001")


def upgrade() -> None:
    uuid_type = postgresql.UUID(as_uuid=True)
    timestamp = sa.DateTime(timezone=True)
    op.create_table(
        "users",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("platform_subject", sa.String(200), nullable=False, unique=True),
        sa.Column("created_at", timestamp, nullable=False),
    )
    op.create_table(
        "fandoms",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("name_ko", sa.String(100), nullable=False, unique=True),
        sa.Column("artist_name_ko", sa.String(200)),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", timestamp, nullable=False),
    )
    op.create_table(
        "seasons",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("name_ko", sa.String(100), nullable=False),
        sa.Column("starts_at", timestamp, nullable=False),
        sa.Column("ends_at", timestamp, nullable=False),
        sa.Column("created_at", timestamp, nullable=False),
        sa.CheckConstraint("ends_at > starts_at", name="ck_seasons_valid_interval"),
    )
    op.create_table(
        "season_memberships",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("season_id", uuid_type, sa.ForeignKey("seasons.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("fandom_id", uuid_type, sa.ForeignKey("fandoms.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("locked_at", timestamp),
        sa.Column("created_at", timestamp, nullable=False),
        sa.Column("updated_at", timestamp, nullable=False),
        sa.UniqueConstraint("user_id", "season_id", name="uq_membership_user_season"),
    )

    now = datetime.now(timezone.utc)
    fandom_table = sa.table(
        "fandoms",
        sa.column("id", uuid_type),
        sa.column("name_ko", sa.String),
        sa.column("artist_name_ko", sa.String),
        sa.column("is_active", sa.Boolean),
        sa.column("created_at", timestamp),
    )
    op.bulk_insert(
        fandom_table,
        [
            {"id": ARMY_ID, "name_ko": "ARMY", "artist_name_ko": "방탄소년단", "is_active": True, "created_at": now},
            {"id": BLINK_ID, "name_ko": "BLINK", "artist_name_ko": "BLACKPINK", "is_active": True, "created_at": now},
            {"id": CARAT_ID, "name_ko": "CARAT", "artist_name_ko": "SEVENTEEN", "is_active": True, "created_at": now},
        ],
    )
    season_table = sa.table(
        "seasons",
        sa.column("id", uuid_type),
        sa.column("name_ko", sa.String),
        sa.column("starts_at", timestamp),
        sa.column("ends_at", timestamp),
        sa.column("created_at", timestamp),
    )
    op.bulk_insert(
        season_table,
        [{
            "id": SEASON_ID,
            "name_ko": "시즌 1",
            "starts_at": datetime(2020, 1, 1, tzinfo=timezone.utc),
            "ends_at": datetime(2100, 1, 1, tzinfo=timezone.utc),
            "created_at": now,
        }],
    )


def downgrade() -> None:
    op.drop_table("season_memberships")
    op.drop_table("seasons")
    op.drop_table("fandoms")
    op.drop_table("users")
