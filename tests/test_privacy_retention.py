import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from struct import pack
import sys
from zlib import crc32

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ktown_defense.privacy import PrivacyRetentionService


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return pack(">I", len(data)) + kind + data + pack(
        ">I", crc32(kind + data) & 0xFFFFFFFF
    )


class MutableClock:
    def __init__(self, now: datetime) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now


class PrivacyRetentionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.decided_at = datetime(2026, 8, 1, 12, tzinfo=timezone.utc)
        self.clock = MutableClock(self.decided_at)
        self.service = PrivacyRetentionService(self.clock)

    def test_exif_is_removed_before_photo_is_stored(self) -> None:
        image = (
            b"\x89PNG\r\n\x1a\n"
            + png_chunk(b"eXIf", b"camera-model-and-gps")
            + png_chunk(b"IDAT", b"")
            + png_chunk(b"IEND", b"")
        )

        stored = self.service.store_photo(
            photo_asset_id="photo-1",
            checkin_id="checkin-1",
            content=image,
            mime_type="image/png",
            captured_at=self.decided_at,
        )

        self.assertNotIn(b"eXIf", stored.content)
        self.assertNotIn(b"camera-model-and-gps", stored.content)
        self.assertEqual(self.decided_at, stored.exif_removed_at)
        self.assertIs(stored, self.service.photo_store["photo-1"])

    def test_raw_evidence_is_deleted_at_30_and_90_day_boundaries(self) -> None:
        jpeg_without_metadata = b"\xff\xd8\xff\xd9"
        self.service.store_gps(
            gps_sample_id="gps-1",
            checkin_id="checkin-1",
            latitude=37.5,
            longitude=127.0,
            captured_at=self.decided_at,
        )
        self.service.store_photo(
            photo_asset_id="photo-1",
            checkin_id="checkin-1",
            content=jpeg_without_metadata,
            mime_type="image/jpeg",
            captured_at=self.decided_at,
        )
        self.service.finalize_checkin("checkin-1", decided_at=self.decided_at)

        before_gps_deadline = self.service.purge_expired(
            now=self.decided_at + timedelta(days=30) - timedelta(microseconds=1)
        )
        self.assertEqual((0, 0), (before_gps_deadline.gps_deleted, before_gps_deadline.photos_deleted))
        at_gps_deadline = self.service.purge_expired(
            now=self.decided_at + timedelta(days=30)
        )
        self.assertEqual((1, 0), (at_gps_deadline.gps_deleted, at_gps_deadline.photos_deleted))
        self.assertNotIn("gps-1", self.service.gps_store)
        self.assertIn("photo-1", self.service.photo_store)

        at_photo_deadline = self.service.purge_expired(
            now=self.decided_at + timedelta(days=90)
        )
        self.assertEqual((0, 1), (at_photo_deadline.gps_deleted, at_photo_deadline.photos_deleted))
        self.assertNotIn("photo-1", self.service.photo_store)

    def test_unfinalized_evidence_has_no_retention_clock(self) -> None:
        self.service.store_gps(
            gps_sample_id="gps-pending",
            checkin_id="pending",
            latitude=37.5,
            longitude=127.0,
            captured_at=self.decided_at,
        )
        result = self.service.purge_expired(now=self.decided_at + timedelta(days=365))
        self.assertEqual(0, result.gps_deleted)
        self.assertIn("gps-pending", self.service.gps_store)

    def test_withdrawal_removes_direct_identity_and_unlinks_ledger(self) -> None:
        account = self.service.register_user(
            "user-1",
            direct_identifiers={"email": "fan@example.test", "name": "테스트 사용자"},
            anonymous_ledger_id="anon-fixed",
        )
        identity = self.service.add_login_identity(
            "user-1", provider="oidc", provider_subject="provider-subject"
        )
        ledger = self.service.add_ledger_record(
            "user-1", ledger_event_id="ledger-1", points=100
        )

        self.service.withdraw_user("user-1")

        self.assertEqual("anon-fixed", ledger.subject_id)
        self.assertNotEqual(account.user_id, ledger.subject_id)
        self.assertNotIn("user-1", self.service.users)
        self.assertNotIn(identity.login_identity_id, self.service.identities)
        self.assertFalse(
            any(
                value == "fan@example.test" or value == "provider-subject"
                for user in self.service.users.values()
                for value in user.direct_identifiers.values()
            )
        )


if __name__ == "__main__":
    unittest.main()
