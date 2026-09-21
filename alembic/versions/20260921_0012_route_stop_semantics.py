"""Expand expedition persistence with route and stop semantics."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260921_0012"
down_revision: str | None = "20260921_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("expedition_stops", sa.Column("stop_kind", sa.String(20)))
    op.add_column("expedition_stops", sa.Column("is_required", sa.Boolean()))
    op.add_column("expedition_stops", sa.Column("placement", sa.String(20)))
    op.add_column("expedition_stops", sa.Column("recommendation_source", sa.String(40)))
    op.add_column("expedition_stops", sa.Column("recommendation_reason", sa.Text()))
    op.add_column(
        "expedition_stops",
        sa.Column("recommendation_metadata", postgresql.JSONB(astext_type=sa.Text())),
    )
    op.execute(
        "UPDATE expedition_stops SET stop_kind = 'anchor', is_required = true, "
        "placement = 'main', recommendation_metadata = '{}'::jsonb"
    )
    remaining = op.get_bind().execute(
        sa.text(
            "SELECT count(*) FROM expedition_stops WHERE stop_kind IS NULL "
            "OR is_required IS NULL OR placement IS NULL OR recommendation_metadata IS NULL"
        )
    ).scalar_one()
    if remaining:
        raise RuntimeError("route stop semantic backfill left null rows")
    for column, default in (
        ("stop_kind", "'anchor'"),
        ("is_required", "true"),
        ("placement", "'main'"),
        ("recommendation_metadata", "'{}'::jsonb"),
    ):
        op.alter_column(
            "expedition_stops", column, nullable=False, server_default=sa.text(default)
        )
    op.create_check_constraint(
        "ck_expedition_stop_kind",
        "expedition_stops",
        "stop_kind IN ('anchor', 'recommendation')",
    )
    op.create_check_constraint(
        "ck_expedition_stop_placement",
        "expedition_stops",
        "placement IN ('before', 'main', 'between', 'after')",
    )
    op.create_check_constraint(
        "ck_expedition_stop_semantics",
        "expedition_stops",
        "(stop_kind = 'anchor' AND is_required AND placement = 'main' "
        "AND recommendation_source IS NULL) OR "
        "(stop_kind = 'recommendation' AND NOT is_required)",
    )
    op.add_column("expeditions", sa.Column("route_key", sa.String(64)))
    op.add_column("expeditions", sa.Column("route_version", sa.String(200)))


def downgrade() -> None:
    op.drop_column("expeditions", "route_version")
    op.drop_column("expeditions", "route_key")
    # Development databases may have been stamped by an earlier draft.  The
    # contract columns are still removed below, while optional draft
    # constraints are handled idempotently.
    op.execute("ALTER TABLE expedition_stops DROP CONSTRAINT IF EXISTS ck_expedition_stop_semantics")
    op.execute("ALTER TABLE expedition_stops DROP CONSTRAINT IF EXISTS ck_expedition_stop_placement")
    op.execute("ALTER TABLE expedition_stops DROP CONSTRAINT IF EXISTS ck_expedition_stop_kind")
    op.drop_column("expedition_stops", "recommendation_metadata")
    op.drop_column("expedition_stops", "recommendation_reason")
    op.drop_column("expedition_stops", "recommendation_source")
    op.drop_column("expedition_stops", "placement")
    op.drop_column("expedition_stops", "is_required")
    op.drop_column("expedition_stops", "stop_kind")
