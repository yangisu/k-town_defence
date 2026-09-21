"""Persist a member's active expedition and its verified recommendation stops."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260921_0010"
down_revision: str | None = "20260921_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    uuid_type = postgresql.UUID(as_uuid=True)
    timestamp = sa.DateTime(timezone=True)
    op.create_table(
        "expeditions",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("season_id", uuid_type, sa.ForeignKey("seasons.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("fandom_id", uuid_type, sa.ForeignKey("fandoms.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("recommendation_id", sa.String(64), nullable=False),
        sa.Column("region_code", sa.String(20), nullable=False),
        sa.Column("territory_id", sa.String(40)),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("keyword", sa.String(100)),
        sa.Column("travel_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", timestamp, nullable=False),
        sa.Column("updated_at", timestamp, nullable=False),
        sa.Column("completed_at", timestamp),
        sa.CheckConstraint("status IN ('active', 'completed', 'abandoned')", name="ck_expeditions_status"),
    )
    op.create_index("ix_expeditions_user_status", "expeditions", ["user_id", "status"])
    op.create_index(
        "uq_expeditions_one_active_per_user",
        "expeditions",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )
    op.create_table(
        "expedition_stops",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("expedition_id", uuid_type, sa.ForeignKey("expeditions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("place_id", uuid_type, sa.ForeignKey("places.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("stop_order", sa.Integer(), nullable=False),
        sa.Column("distance_km", sa.Numeric(8, 3), nullable=False),
        sa.Column("reasons", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("completed_at", timestamp),
        sa.UniqueConstraint("expedition_id", "stop_order", name="uq_expedition_stop_order"),
        sa.UniqueConstraint("expedition_id", "place_id", name="uq_expedition_stop_place"),
        sa.CheckConstraint("stop_order > 0", name="ck_expedition_stop_order_positive"),
    )
    op.create_index("ix_expedition_stops_expedition_id", "expedition_stops", ["expedition_id"])
    op.add_column("checkin_sessions", sa.Column("expedition_stop_id", uuid_type))
    op.create_foreign_key(
        "fk_checkin_sessions_expedition_stop_id",
        "checkin_sessions",
        "expedition_stops",
        ["expedition_stop_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_checkin_sessions_expedition_stop_id", "checkin_sessions", ["expedition_stop_id"])


def downgrade() -> None:
    # IF EXISTS also lets development databases roll back an earlier draft of
    # this not-yet-released migration safely.
    op.execute("DROP INDEX IF EXISTS ix_checkin_sessions_expedition_stop_id")
    op.execute(
        "ALTER TABLE checkin_sessions DROP CONSTRAINT IF EXISTS fk_checkin_sessions_expedition_stop_id"
    )
    op.execute("ALTER TABLE checkin_sessions DROP COLUMN IF EXISTS expedition_stop_id")
    op.drop_table("expedition_stops")
    op.drop_index("uq_expeditions_one_active_per_user", table_name="expeditions")
    op.drop_index("ix_expeditions_user_status", table_name="expeditions")
    op.drop_table("expeditions")
