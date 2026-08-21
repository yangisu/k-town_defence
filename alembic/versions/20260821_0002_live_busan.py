"""Add live tourism metadata and synchronization runs."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260821_0002"
down_revision: str | None = "20260821_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "places",
        sa.Column("source", sa.String(30), nullable=False, server_default="operator"),
    )
    op.add_column("places", sa.Column("content_type_id", sa.String(20)))
    op.add_column("places", sa.Column("category_code", sa.String(30)))
    op.add_column("places", sa.Column("image_url", sa.String(1000)))
    op.add_column("places", sa.Column("source_modified_at", sa.DateTime(timezone=True)))
    op.create_table(
        "catalog_sync_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source", sa.String(30), nullable=False),
        sa.Column("area_code", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("snapshot_version", sa.String(100)),
        sa.Column("fetched_count", sa.Integer(), nullable=False),
        sa.Column("active_count", sa.Integer(), nullable=False),
        sa.Column("error_code", sa.String(100)),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "status IN ('running', 'succeeded', 'failed')",
            name="ck_catalog_sync_runs_status",
        ),
    )
    op.create_index(
        "ix_catalog_sync_runs_source_started",
        "catalog_sync_runs",
        ["source", "started_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_catalog_sync_runs_source_started", table_name="catalog_sync_runs")
    op.drop_table("catalog_sync_runs")
    op.drop_column("places", "source_modified_at")
    op.drop_column("places", "image_url")
    op.drop_column("places", "category_code")
    op.drop_column("places", "content_type_id")
    op.drop_column("places", "source")
