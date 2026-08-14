from __future__ import annotations

from datetime import datetime, timedelta, timezone
import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from ktown_defense.checkin import (
    CheckInError,
    CheckInSession,
    GpsSample,
    SessionStatus,
)


START = datetime(2026, 8, 12, 3, 0, tzinfo=timezone.utc)


class CheckInRecoveryTests(unittest.TestCase):
    def session(self) -> CheckInSession:
        return CheckInSession("session-1", "user-1", "place-1", "season-1", START)

    @staticmethod
    def sample(sequence: int, kind: str, at: datetime, accuracy: float = 50) -> GpsSample:
        return GpsSample(sequence, kind, 37.1, 128.1, accuracy, at)

    def complete_requirements(self, session: CheckInSession) -> None:
        for sequence, kind, seconds in ((1, "start", 1), (2, "middle", 150), (3, "end", 300)):
            at = START + timedelta(seconds=seconds)
            session.add_gps_sample(self.sample(sequence, kind, at), now=at)
        session.capture_photo(
            upload_idempotency_key="photo-key",
            captured_at=START + timedelta(seconds=299),
            now=START + timedelta(seconds=300),
            captured_with_session_camera=True,
        )

    def test_required_gps_dwell_and_session_camera_photo_make_session_ready(self) -> None:
        session = self.session()
        self.complete_requirements(session)

        self.assertEqual(SessionStatus.READY_TO_SUBMIT, session.status)
        self.assertEqual(300, session.active_dwell_seconds)
        self.assertTrue(session.gps_submission_complete)
        self.assertTrue(session.gps_auto_approval_eligible)

    def test_51_to_100m_samples_allow_submission_but_not_auto_approval(self) -> None:
        session = self.session()
        for sequence, kind, seconds in ((1, "start", 1), (2, "middle", 150), (3, "end", 300)):
            at = START + timedelta(seconds=seconds)
            session.add_gps_sample(self.sample(sequence, kind, at, 75), now=at)
        session.capture_photo(
            upload_idempotency_key="photo-key",
            captured_at=START + timedelta(seconds=300),
            now=START + timedelta(seconds=300),
            captured_with_session_camera=True,
        )

        self.assertEqual(SessionStatus.READY_TO_SUBMIT, session.status)
        self.assertFalse(session.gps_auto_approval_eligible)

    def test_over_100m_sample_and_gallery_photo_do_not_satisfy_conditions(self) -> None:
        session = self.session()
        at = START + timedelta(seconds=1)
        session.add_gps_sample(self.sample(1, "start", at, 100.01), now=at)
        with self.assertRaisesRegex(CheckInError, "웹 카메라") as raised:
            session.capture_photo(
                upload_idempotency_key="gallery",
                captured_at=at,
                now=at,
                captured_with_session_camera=False,
            )

        self.assertEqual("CAMERA_CAPTURE_REQUIRED", raised.exception.code)
        self.assertFalse(session.gps_submission_complete)
        self.assertIsNone(session.photo)

    def test_hidden_tab_pauses_immediately_and_only_foreground_dwell_counts(self) -> None:
        session = self.session()
        session.pause(START + timedelta(seconds=120))
        session.advance(START + timedelta(seconds=240))
        session.resume(
            START + timedelta(seconds=240),
            tab_active=True,
            network_connected=True,
            gps_permission=True,
            location_reconfirmed=True,
        )
        session.advance(START + timedelta(seconds=420))

        self.assertEqual(300, session.active_dwell_seconds)
        self.assertEqual(SessionStatus.COLLECTING, session.status)

    def test_reload_recovers_unexpired_session_as_paused_without_duplicate_samples(self) -> None:
        session = self.session()
        first = self.sample(1, "start", START + timedelta(seconds=10))
        session.add_gps_sample(first, now=first.captured_at)

        status = session.recover_after_reload(START + timedelta(seconds=30))

        self.assertEqual(SessionStatus.PAUSED, status)
        self.assertEqual([first], session.samples)
        with self.assertRaises(CheckInError) as raised:
            session.add_gps_sample(first, now=START + timedelta(seconds=31))
        self.assertEqual("CHECKIN_SESSION_PAUSED", raised.exception.code)

    def test_network_gap_never_counts_and_reconnect_requires_new_location_confirmation(self) -> None:
        session = self.session()
        session.pause(START + timedelta(seconds=60))

        still_paused = session.resume(
            START + timedelta(seconds=240),
            tab_active=True,
            network_connected=True,
            gps_permission=True,
            location_reconfirmed=False,
        )
        self.assertEqual(SessionStatus.PAUSED, still_paused)
        session.resume(
            START + timedelta(seconds=241),
            tab_active=True,
            network_connected=True,
            gps_permission=True,
            location_reconfirmed=True,
        )
        recovery = self.sample(1, "recovery", START + timedelta(seconds=241))
        session.add_gps_sample(recovery, now=recovery.captured_at)
        session.advance(START + timedelta(seconds=301))

        self.assertEqual(120, session.active_dwell_seconds)

    def test_duplicate_submit_and_photo_upload_return_first_success_identifiers(self) -> None:
        session = self.session()
        for sequence, kind, seconds in ((1, "start", 1), (2, "middle", 150), (3, "end", 300)):
            at = START + timedelta(seconds=seconds)
            session.add_gps_sample(self.sample(sequence, kind, at), now=at)
        first_photo = session.capture_photo(
            upload_idempotency_key="photo-key",
            captured_at=START + timedelta(seconds=299),
            now=START + timedelta(seconds=300),
            captured_with_session_camera=True,
        )
        duplicate_photo = session.capture_photo(
            upload_idempotency_key="photo-key",
            captured_at=START + timedelta(seconds=299),
            now=START + timedelta(seconds=300),
            captured_with_session_camera=True,
        )
        self.assertIs(first_photo, duplicate_photo)

        first = session.submit(idempotency_key="submit-key", now=START + timedelta(seconds=301))
        duplicate = session.submit(idempotency_key="submit-key", now=START + timedelta(seconds=302))

        self.assertIs(first, duplicate)
        with self.assertRaises(CheckInError) as raised:
            session.submit(idempotency_key="different-key", now=START + timedelta(seconds=303))
        self.assertEqual("VALIDATION_FAILED", raised.exception.code)

    def test_thirty_minute_boundary_expires_and_closed_session_rejects_submit(self) -> None:
        session = self.session()
        self.assertEqual(SessionStatus.EXPIRED, session.advance(START + timedelta(minutes=30)))
        self.assertEqual(1800, session.active_dwell_seconds)

        with self.assertRaises(CheckInError) as raised:
            session.submit(idempotency_key="submit-key", now=START + timedelta(minutes=30))
        self.assertEqual("CHECKIN_SESSION_CLOSED", raised.exception.code)
        with self.assertRaises(CheckInError) as resume_error:
            session.resume(
                START + timedelta(minutes=30),
                tab_active=True,
                network_connected=True,
                gps_permission=True,
                location_reconfirmed=True,
            )
        self.assertEqual("CHECKIN_SESSION_CLOSED", resume_error.exception.code)

    def test_cancelled_session_is_terminal_and_permission_denial_is_explicit(self) -> None:
        session = self.session()
        session.pause(START + timedelta(seconds=1))
        with self.assertRaises(CheckInError) as permission_error:
            session.resume(
                START + timedelta(seconds=2),
                tab_active=True,
                network_connected=True,
                gps_permission=False,
                location_reconfirmed=True,
            )
        self.assertEqual("GPS_PERMISSION_DENIED", permission_error.exception.code)

        session.cancel(START + timedelta(seconds=3))
        with self.assertRaises(CheckInError) as submit_error:
            session.submit(idempotency_key="submit-key", now=START + timedelta(seconds=4))
        self.assertEqual("CHECKIN_SESSION_CLOSED", submit_error.exception.code)


if __name__ == "__main__":
    unittest.main()
