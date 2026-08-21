"""Create persistent place and check-in MVP tables."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260821_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "places",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("content_id", sa.String(64), nullable=True),
        sa.Column("name_ko", sa.String(200), nullable=False),
        sa.Column("address_ko", sa.String(500), nullable=False),
        sa.Column("latitude", sa.Numeric(9, 6), nullable=False),
        sa.Column("longitude", sa.Numeric(9, 6), nullable=False),
        sa.Column("region_code", sa.String(20), nullable=False),
        sa.Column("description_ko", sa.Text(), nullable=False),
        sa.Column("is_public", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("latitude >= -90 AND latitude <= 90", name="ck_places_latitude"),
        sa.CheckConstraint("longitude >= -180 AND longitude <= 180", name="ck_places_longitude"),
        sa.UniqueConstraint("content_id", name="uq_places_content_id"),
    )
    op.create_index(
        "ix_places_public_name",
        "places",
        ["is_public", "is_active", "name_ko", "id"],
    )

    op.create_table(
        "checkin_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(200), nullable=False),
        sa.Column("place_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('collecting', 'ready', 'submitted', 'expired', 'cancelled')",
            name="ck_checkin_sessions_status",
        ),
        sa.ForeignKeyConstraint(["place_id"], ["places.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_checkin_sessions_user_id", "checkin_sessions", ["user_id"])
    op.create_index(
        "ix_checkin_sessions_user_place_status",
        "checkin_sessions",
        ["user_id", "place_id", "status"],
    )

    op.create_table(
        "checkin_gps_samples",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("latitude", sa.Numeric(9, 6), nullable=False),
        sa.Column("longitude", sa.Numeric(9, 6), nullable=False),
        sa.Column("accuracy_meters", sa.Numeric(8, 2), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("sequence > 0", name="ck_gps_sequence_positive"),
        sa.CheckConstraint("latitude >= -90 AND latitude <= 90", name="ck_gps_latitude"),
        sa.CheckConstraint("longitude >= -180 AND longitude <= 180", name="ck_gps_longitude"),
        sa.CheckConstraint("accuracy_meters >= 0", name="ck_gps_accuracy"),
        sa.ForeignKeyConstraint(["session_id"], ["checkin_sessions.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("session_id", "sequence", name="uq_gps_session_sequence"),
    )
    op.create_index(
        "ix_checkin_gps_samples_session_id", "checkin_gps_samples", ["session_id"]
    )

    op.create_table(
        "checkin_photos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("content_type", sa.String(50), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["checkin_sessions.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("storage_key", name="uq_checkin_photos_storage_key"),
    )
    op.create_index("ix_checkin_photos_session_id", "checkin_photos", ["session_id"])

    op.create_table(
        "checkin_submissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("idempotency_key", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("decision", sa.String(20), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("decision = 'pending'", name="ck_submissions_decision"),
        sa.ForeignKeyConstraint(["session_id"], ["checkin_sessions.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("session_id", name="uq_checkin_submissions_session_id"),
        sa.UniqueConstraint("idempotency_key", name="uq_checkin_submissions_idempotency_key"),
    )


def downgrade() -> None:
    op.drop_table("checkin_submissions")
    op.drop_index("ix_checkin_photos_session_id", table_name="checkin_photos")
    op.drop_table("checkin_photos")
    op.drop_index("ix_checkin_gps_samples_session_id", table_name="checkin_gps_samples")
    op.drop_table("checkin_gps_samples")
    op.drop_index("ix_checkin_sessions_user_place_status", table_name="checkin_sessions")
    op.drop_index("ix_checkin_sessions_user_id", table_name="checkin_sessions")
    op.drop_table("checkin_sessions")
    op.drop_index("ix_places_public_name", table_name="places")
    op.drop_table("places")
