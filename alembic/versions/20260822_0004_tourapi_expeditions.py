"""Add enriched tourism fields and secret-free OpenAPI call evidence."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260822_0004"
down_revision: str | None = "20260822_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    empty_object = sa.text("'{}'::jsonb")
    empty_array = sa.text("'[]'::jsonb")
    op.add_column("places", sa.Column("homepage_url", sa.String(1000)))
    op.add_column("places", sa.Column("telephone", sa.String(200)))
    op.add_column("places", sa.Column("open_time", sa.Text()))
    op.add_column("places", sa.Column("rest_date", sa.Text()))
    op.add_column("places", sa.Column("parking", sa.Text()))
    op.add_column(
        "places",
        sa.Column(
            "intro_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=empty_object,
        ),
    )
    op.add_column(
        "places",
        sa.Column(
            "info_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=empty_array,
        ),
    )
    op.add_column(
        "places",
        sa.Column(
            "image_urls",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=empty_array,
        ),
    )
    op.add_column("places", sa.Column("festival_start_date", sa.Date()))
    op.add_column("places", sa.Column("festival_end_date", sa.Date()))
    op.add_column(
        "places",
        sa.Column(
            "discovery_keywords",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=empty_array,
        ),
    )
    op.add_column(
        "places",
        sa.Column(
            "source_operations",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=empty_array,
        ),
    )

    uuid_type = postgresql.UUID(as_uuid=True)
    timestamp = sa.DateTime(timezone=True)
    op.create_table(
        "open_api_call_logs",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column(
            "sync_run_id",
            uuid_type,
            sa.ForeignKey("catalog_sync_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("operation", sa.String(100), nullable=False),
        sa.Column("feature", sa.String(100), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("response_count", sa.Integer(), nullable=False),
        sa.Column("error_code", sa.String(100)),
        sa.Column("started_at", timestamp, nullable=False),
        sa.Column("completed_at", timestamp, nullable=False),
        sa.CheckConstraint(
            "status IN ('succeeded', 'failed')",
            name="ck_open_api_call_logs_status",
        ),
    )
    op.create_index(
        "ix_open_api_call_logs_operation_completed",
        "open_api_call_logs",
        ["operation", "completed_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_open_api_call_logs_operation_completed",
        table_name="open_api_call_logs",
    )
    op.drop_table("open_api_call_logs")
    for name in (
        "source_operations",
        "discovery_keywords",
        "festival_end_date",
        "festival_start_date",
        "image_urls",
        "info_json",
        "intro_json",
        "parking",
        "rest_date",
        "open_time",
        "telephone",
        "homepage_url",
    ):
        op.drop_column("places", name)
