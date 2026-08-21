"""Persistent models for the first integrated MVP vertical slice."""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PostgreSQLUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class UserModel(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    platform_subject: Mapped[str] = mapped_column(String(200), unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )


class FandomModel(Base):
    __tablename__ = "fandoms"

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    name_ko: Mapped[str] = mapped_column(String(100), unique=True)
    artist_name_ko: Mapped[str | None] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )


class SeasonModel(Base):
    __tablename__ = "seasons"
    __table_args__ = (
        CheckConstraint("ends_at > starts_at", name="ck_seasons_valid_interval"),
    )

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    name_ko: Mapped[str] = mapped_column(String(100))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )


class SeasonMembershipModel(Base):
    __tablename__ = "season_memberships"
    __table_args__ = (
        UniqueConstraint("user_id", "season_id", name="uq_membership_user_season"),
    )

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    user_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    season_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("seasons.id", ondelete="RESTRICT")
    )
    fandom_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("fandoms.id", ondelete="RESTRICT")
    )
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


class PlaceModel(Base):
    __tablename__ = "places"
    __table_args__ = (
        CheckConstraint("latitude >= -90 AND latitude <= 90", name="ck_places_latitude"),
        CheckConstraint("longitude >= -180 AND longitude <= 180", name="ck_places_longitude"),
        Index("ix_places_public_name", "is_public", "is_active", "name_ko", "id"),
    )

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    content_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    name_ko: Mapped[str] = mapped_column(String(200))
    address_ko: Mapped[str] = mapped_column(String(500))
    latitude: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    region_code: Mapped[str] = mapped_column(String(20))
    description_ko: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(30), default="operator")
    content_type_id: Mapped[str | None] = mapped_column(String(20))
    category_code: Mapped[str | None] = mapped_column(String(30))
    image_url: Mapped[str | None] = mapped_column(String(1000))
    homepage_url: Mapped[str | None] = mapped_column(String(1000))
    telephone: Mapped[str | None] = mapped_column(String(200))
    open_time: Mapped[str | None] = mapped_column(Text)
    rest_date: Mapped[str | None] = mapped_column(Text)
    parking: Mapped[str | None] = mapped_column(Text)
    intro_json: Mapped[dict[str, object]] = mapped_column(JSONB, default=dict)
    info_json: Mapped[list[dict[str, object]]] = mapped_column(JSONB, default=list)
    image_urls: Mapped[list[str]] = mapped_column(JSONB, default=list)
    festival_start_date: Mapped[date | None] = mapped_column(Date)
    festival_end_date: Mapped[date | None] = mapped_column(Date)
    discovery_keywords: Mapped[list[str]] = mapped_column(JSONB, default=list)
    source_operations: Mapped[list[str]] = mapped_column(JSONB, default=list)
    source_modified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


class CatalogSyncRunModel(Base):
    __tablename__ = "catalog_sync_runs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('running', 'succeeded', 'failed')",
            name="ck_catalog_sync_runs_status",
        ),
        Index("ix_catalog_sync_runs_source_started", "source", "started_at"),
    )

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    source: Mapped[str] = mapped_column(String(30))
    area_code: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20))
    snapshot_version: Mapped[str | None] = mapped_column(String(100))
    fetched_count: Mapped[int] = mapped_column(Integer, default=0)
    active_count: Mapped[int] = mapped_column(Integer, default=0)
    error_code: Mapped[str | None] = mapped_column(String(100))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class OpenApiCallLogModel(Base):
    __tablename__ = "open_api_call_logs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('succeeded', 'failed')",
            name="ck_open_api_call_logs_status",
        ),
        Index(
            "ix_open_api_call_logs_operation_completed",
            "operation",
            "completed_at",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    sync_run_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("catalog_sync_runs.id", ondelete="CASCADE"),
    )
    operation: Mapped[str] = mapped_column(String(100))
    feature: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20))
    response_count: Mapped[int] = mapped_column(Integer, default=0)
    error_code: Mapped[str | None] = mapped_column(String(100))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class CheckInSessionModel(Base):
    __tablename__ = "checkin_sessions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('collecting', 'ready', 'submitted', 'expired', 'cancelled')",
            name="ck_checkin_sessions_status",
        ),
        Index("ix_checkin_sessions_user_place_status", "user_id", "place_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    user_id: Mapped[str] = mapped_column(String(200), index=True)
    place_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("places.id", ondelete="RESTRICT")
    )
    status: Mapped[str] = mapped_column(String(20), default="collecting")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


class GpsSampleModel(Base):
    __tablename__ = "checkin_gps_samples"
    __table_args__ = (
        UniqueConstraint("session_id", "sequence", name="uq_gps_session_sequence"),
        CheckConstraint("sequence > 0", name="ck_gps_sequence_positive"),
        CheckConstraint("latitude >= -90 AND latitude <= 90", name="ck_gps_latitude"),
        CheckConstraint("longitude >= -180 AND longitude <= 180", name="ck_gps_longitude"),
        CheckConstraint("accuracy_meters >= 0", name="ck_gps_accuracy"),
    )

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    session_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("checkin_sessions.id", ondelete="CASCADE"),
        index=True,
    )
    sequence: Mapped[int] = mapped_column(Integer)
    latitude: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    accuracy_meters: Mapped[Decimal] = mapped_column(Numeric(8, 2))
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )


class PhotoModel(Base):
    __tablename__ = "checkin_photos"

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    session_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("checkin_sessions.id", ondelete="CASCADE"),
        index=True,
    )
    storage_key: Mapped[str] = mapped_column(String(500), unique=True)
    content_type: Mapped[str] = mapped_column(String(50))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    sha256: Mapped[str] = mapped_column(String(64))
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )


class SubmissionModel(Base):
    __tablename__ = "checkin_submissions"
    __table_args__ = (
        CheckConstraint("decision = 'pending'", name="ck_submissions_decision"),
    )

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    session_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("checkin_sessions.id", ondelete="RESTRICT"),
        unique=True,
    )
    idempotency_key: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), unique=True
    )
    decision: Mapped[str] = mapped_column(String(20), default="pending")
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
