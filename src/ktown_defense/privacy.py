"""Privacy lifecycle for check-in evidence and withdrawn accounts.

The service intentionally keeps raw evidence in private, in-memory stores.  A
production adapter can replace those dictionaries with object storage while
preserving the same retention and anonymisation boundaries.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from hashlib import sha256
from struct import pack, unpack
from typing import Callable, Final
from uuid import uuid4
from zlib import crc32


GPS_RETENTION: Final = timedelta(days=30)
PHOTO_RETENTION: Final = timedelta(days=90)


class PrivacyError(RuntimeError):
    """Stable domain error for invalid privacy lifecycle operations."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass
class UserAccount:
    user_id: str
    direct_identifiers: dict[str, str]
    anonymous_ledger_id: str = field(default_factory=lambda: f"anon_{uuid4().hex}")


@dataclass(frozen=True)
class LoginIdentity:
    login_identity_id: str
    user_id: str
    provider: str
    provider_subject: str


@dataclass(frozen=True)
class RawGpsEvidence:
    gps_sample_id: str
    checkin_id: str
    latitude: float
    longitude: float
    captured_at: datetime
    delete_after: datetime | None = None


@dataclass(frozen=True)
class PrivatePhotoEvidence:
    photo_asset_id: str
    checkin_id: str
    content: bytes
    mime_type: str
    sha256: str
    captured_at: datetime
    exif_removed_at: datetime
    delete_after: datetime | None = None


@dataclass
class AnonymousLedgerRecord:
    ledger_event_id: str
    subject_id: str
    points: int


@dataclass(frozen=True)
class RetentionPurgeResult:
    gps_deleted: int
    photos_deleted: int


@dataclass
class PrivacyRetentionService:
    """Store minimal evidence, enforce retention, and unlink withdrawn users."""

    clock: Callable[[], datetime]
    users: dict[str, UserAccount] = field(default_factory=dict)
    identities: dict[str, LoginIdentity] = field(default_factory=dict)
    gps_store: dict[str, RawGpsEvidence] = field(default_factory=dict)
    photo_store: dict[str, PrivatePhotoEvidence] = field(default_factory=dict)
    ledger: dict[str, AnonymousLedgerRecord] = field(default_factory=dict)

    def register_user(
        self,
        user_id: str,
        *,
        direct_identifiers: dict[str, str],
        anonymous_ledger_id: str | None = None,
    ) -> UserAccount:
        if user_id in self.users:
            raise PrivacyError("USER_ALREADY_EXISTS", "이미 등록된 사용자입니다.")
        account = UserAccount(
            user_id=user_id,
            direct_identifiers=dict(direct_identifiers),
            anonymous_ledger_id=anonymous_ledger_id or f"anon_{uuid4().hex}",
        )
        self.users[user_id] = account
        return account

    def add_login_identity(
        self, user_id: str, *, provider: str, provider_subject: str
    ) -> LoginIdentity:
        self._account(user_id)
        identity = LoginIdentity(str(uuid4()), user_id, provider, provider_subject)
        self.identities[identity.login_identity_id] = identity
        return identity

    def add_ledger_record(
        self, user_id: str, *, ledger_event_id: str, points: int
    ) -> AnonymousLedgerRecord:
        self._account(user_id)
        if ledger_event_id in self.ledger:
            return self.ledger[ledger_event_id]
        record = AnonymousLedgerRecord(ledger_event_id, user_id, points)
        self.ledger[ledger_event_id] = record
        return record

    def store_gps(
        self,
        *,
        gps_sample_id: str,
        checkin_id: str,
        latitude: float,
        longitude: float,
        captured_at: datetime,
    ) -> RawGpsEvidence:
        self._aware(captured_at)
        evidence = RawGpsEvidence(
            gps_sample_id, checkin_id, latitude, longitude, captured_at
        )
        self.gps_store[gps_sample_id] = evidence
        return evidence

    def store_photo(
        self,
        *,
        photo_asset_id: str,
        checkin_id: str,
        content: bytes,
        mime_type: str,
        captured_at: datetime,
    ) -> PrivatePhotoEvidence:
        """Remove embedded EXIF before the first persistent assignment."""

        self._aware(captured_at)
        now = self._now()
        clean_content = strip_exif(content, mime_type)
        evidence = PrivatePhotoEvidence(
            photo_asset_id=photo_asset_id,
            checkin_id=checkin_id,
            content=clean_content,
            mime_type=mime_type,
            sha256=sha256(clean_content).hexdigest(),
            captured_at=captured_at,
            exif_removed_at=now,
        )
        self.photo_store[photo_asset_id] = evidence
        return evidence

    def finalize_checkin(self, checkin_id: str, *, decided_at: datetime) -> None:
        """Start both retention clocks at the authoritative final decision."""

        self._aware(decided_at)
        for sample_id, sample in tuple(self.gps_store.items()):
            if sample.checkin_id == checkin_id:
                self.gps_store[sample_id] = RawGpsEvidence(
                    sample.gps_sample_id,
                    sample.checkin_id,
                    sample.latitude,
                    sample.longitude,
                    sample.captured_at,
                    decided_at + GPS_RETENTION,
                )
        for asset_id, photo in tuple(self.photo_store.items()):
            if photo.checkin_id == checkin_id:
                self.photo_store[asset_id] = PrivatePhotoEvidence(
                    photo.photo_asset_id,
                    photo.checkin_id,
                    photo.content,
                    photo.mime_type,
                    photo.sha256,
                    photo.captured_at,
                    photo.exif_removed_at,
                    decided_at + PHOTO_RETENTION,
                )

    def purge_expired(self, *, now: datetime | None = None) -> RetentionPurgeResult:
        """Physically remove original evidence at (not after) its deadline."""

        moment = now or self._now()
        self._aware(moment)
        expired_gps = [
            key
            for key, item in self.gps_store.items()
            if item.delete_after is not None and item.delete_after <= moment
        ]
        expired_photos = [
            key
            for key, item in self.photo_store.items()
            if item.delete_after is not None and item.delete_after <= moment
        ]
        for key in expired_gps:
            del self.gps_store[key]
        for key in expired_photos:
            del self.photo_store[key]
        return RetentionPurgeResult(len(expired_gps), len(expired_photos))

    def withdraw_user(self, user_id: str) -> None:
        """Erase the only mapping from direct identity to anonymous ledger ID."""

        account = self._account(user_id)
        for record in self.ledger.values():
            if record.subject_id == user_id:
                record.subject_id = account.anonymous_ledger_id
        for identity_id, identity in tuple(self.identities.items()):
            if identity.user_id == user_id:
                del self.identities[identity_id]
        # Removing the account (rather than retaining a tombstone) eliminates
        # both its direct identifiers and the user_id -> anonymous ID mapping.
        del self.users[user_id]

    def _account(self, user_id: str) -> UserAccount:
        try:
            return self.users[user_id]
        except KeyError as exc:
            raise PrivacyError("USER_NOT_FOUND", "사용자를 찾을 수 없습니다.") from exc

    def _now(self) -> datetime:
        now = self.clock()
        self._aware(now)
        return now

    @staticmethod
    def _aware(value: datetime) -> None:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("server times must be timezone-aware")


def strip_exif(content: bytes, mime_type: str) -> bytes:
    """Return JPEG/PNG bytes without EXIF-bearing metadata chunks."""

    normalized = mime_type.lower().split(";", 1)[0].strip()
    if normalized in {"image/jpeg", "image/jpg"}:
        return _strip_jpeg_exif(content)
    if normalized == "image/png":
        return _strip_png_exif(content)
    raise PrivacyError("UNSUPPORTED_IMAGE_TYPE", "지원하지 않는 사진 형식입니다.")


def _strip_jpeg_exif(content: bytes) -> bytes:
    if not content.startswith(b"\xff\xd8"):
        raise PrivacyError("INVALID_IMAGE", "JPEG 이미지를 디코딩할 수 없습니다.")
    output = bytearray(content[:2])
    offset = 2
    while offset < len(content):
        if content[offset] != 0xFF:
            raise PrivacyError("INVALID_IMAGE", "JPEG 구조가 올바르지 않습니다.")
        marker_start = offset
        while offset < len(content) and content[offset] == 0xFF:
            offset += 1
        if offset >= len(content):
            raise PrivacyError("INVALID_IMAGE", "JPEG 구조가 올바르지 않습니다.")
        marker = content[offset]
        offset += 1
        if marker == 0xD9:
            output.extend(content[marker_start:offset])
            return bytes(output)
        if marker == 0xDA:  # scan data continues through the end marker
            output.extend(content[marker_start:])
            return bytes(output)
        if marker in {0x01, *range(0xD0, 0xD8)}:
            output.extend(content[marker_start:offset])
            continue
        if offset + 2 > len(content):
            raise PrivacyError("INVALID_IMAGE", "JPEG 구조가 올바르지 않습니다.")
        length = int.from_bytes(content[offset : offset + 2], "big")
        segment_end = offset + length
        if length < 2 or segment_end > len(content):
            raise PrivacyError("INVALID_IMAGE", "JPEG 구조가 올바르지 않습니다.")
        payload = content[offset + 2 : segment_end]
        is_exif = marker == 0xE1 and payload.startswith(b"Exif\x00\x00")
        if not is_exif:
            output.extend(content[marker_start:segment_end])
        offset = segment_end
    raise PrivacyError("INVALID_IMAGE", "완전한 JPEG 이미지가 아닙니다.")


def _strip_png_exif(content: bytes) -> bytes:
    signature = b"\x89PNG\r\n\x1a\n"
    if not content.startswith(signature):
        raise PrivacyError("INVALID_IMAGE", "PNG 이미지를 디코딩할 수 없습니다.")
    output = bytearray(signature)
    offset = len(signature)
    saw_iend = False
    while offset + 12 <= len(content):
        length = unpack(">I", content[offset : offset + 4])[0]
        chunk_end = offset + 12 + length
        if chunk_end > len(content):
            raise PrivacyError("INVALID_IMAGE", "PNG 구조가 올바르지 않습니다.")
        chunk_type = content[offset + 4 : offset + 8]
        chunk_data = content[offset + 8 : offset + 8 + length]
        expected_crc = unpack(">I", content[offset + 8 + length : chunk_end])[0]
        if crc32(chunk_type + chunk_data) & 0xFFFFFFFF != expected_crc:
            raise PrivacyError("INVALID_IMAGE", "PNG 체크섬이 올바르지 않습니다.")
        if chunk_type != b"eXIf":
            output.extend(content[offset:chunk_end])
        offset = chunk_end
        if chunk_type == b"IEND":
            saw_iend = True
            break
    if not saw_iend or offset != len(content):
        raise PrivacyError("INVALID_IMAGE", "완전한 PNG 이미지가 아닙니다.")
    return bytes(output)


def make_png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    """Small public helper useful to storage adapters constructing PNG data."""

    return pack(">I", len(data)) + chunk_type + data + pack(
        ">I", crc32(chunk_type + data) & 0xFFFFFFFF
    )
