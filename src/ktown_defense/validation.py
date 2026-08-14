"""Contract-driven validation for the write API boundary.

The module deliberately has no web-framework dependency.  Adapters pass their
decoded HTTP values to :func:`validate_write_request` and receive the exact
status/code pair declared by ``ktown-defense.contracts.yaml``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import math
import re
import unicodedata
import zlib
from urllib.parse import urlparse
from uuid import UUID


@dataclass(frozen=True)
class ValidationError:
    status: int
    code: str
    field: str | None = None


@dataclass(frozen=True)
class FieldRule:
    kind: str
    required: bool = True
    minimum: float | None = None
    maximum: float | None = None
    min_length: int | None = None
    max_length: int | None = None
    choices: tuple[str, ...] = ()


# ``common_types.uuid`` declares both UUID-v4 format and a 36-character size
# ceiling.  Keep the size on the reusable rule so every referenced UUID field
# receives the same deterministic 413/422 classification.
UUID_RULE = FieldRule("uuid", max_length=36)
KOREAN_SHORT = FieldRule("korean", min_length=1, max_length=100)
KOREAN_LONG = FieldRule("korean", min_length=1, max_length=2000)
LATITUDE = FieldRule("number", minimum=-90, maximum=90)
LONGITUDE = FieldRule("number", minimum=-180, maximum=180)


WRITE_CONTRACTS: dict[tuple[str, str], dict[str, object]] = {
    ("PUT", "/api/v1/me/season-membership"): {"body": {"fandom_id": UUID_RULE}},
    ("POST", "/api/v1/checkin-sessions"): {
        "idempotency": True,
        "body": {"place_id": UUID_RULE, "season_id": UUID_RULE},
    },
    ("POST", "/api/v1/checkin-sessions/{id}/gps-samples"): {
        "body": {
            "sample_sequence": FieldRule("integer", minimum=1, maximum=10000),
            "sample_kind": FieldRule("enum", choices=("start", "middle", "end", "recovery")),
            "latitude": LATITUDE,
            "longitude": LONGITUDE,
            "accuracy_m": FieldRule("number", minimum=0, maximum=1000),
            "captured_at": FieldRule("timestamp"),
        }
    },
    ("POST", "/api/v1/checkin-sessions/{id}/photo"): {
        "idempotency": True,
        "multipart": True,
    },
    ("POST", "/api/v1/checkin-sessions/{id}/submit"): {
        "idempotency": True,
        "body": {},
        "states": ("ready_to_submit",),
    },
    ("POST", "/api/v1/checkins/{id}/appeals"): {
        "body": {"reason_ko": FieldRule("korean", min_length=10, max_length=1000)},
        "states": ("rejected",),
    },
    ("PATCH", "/api/v1/admin/review-tasks/{id}"): {
        "body": {
            "decision": FieldRule("enum", choices=("approved", "rejected", "upheld", "overturned")),
            "reason_ko": FieldRule("korean", min_length=1, max_length=1000),
        }
    },
    ("POST", "/api/v1/admin/places"): {
        "body": {
            "name_ko": KOREAN_SHORT,
            "address_ko": FieldRule("korean", min_length=1, max_length=300),
            "description_ko": KOREAN_LONG,
            "transit_guide_ko": FieldRule("korean", min_length=1, max_length=1000),
            "map_deep_link": FieldRule("https", max_length=2048),
            "artist_id": UUID_RULE,
            "evidence_tier": FieldRule("enum", choices=("official", "verified")),
            "latitude": LATITUDE,
            "longitude": LONGITUDE,
            "radius_m": FieldRule("integer", minimum=50, maximum=200),
        }
    },
    ("PATCH", "/api/v1/admin/places/{id}"): {
        "at_least_one": True,
        "body": {
            "name_ko": FieldRule("korean", required=False, min_length=1, max_length=100),
            "address_ko": FieldRule("korean", required=False, min_length=1, max_length=300),
            "description_ko": FieldRule("korean", required=False, min_length=1, max_length=2000),
            "transit_guide_ko": FieldRule("korean", required=False, min_length=1, max_length=1000),
            "map_deep_link": FieldRule("https", required=False, max_length=2048),
            "radius_m": FieldRule("integer", required=False, minimum=50, maximum=200),
            "active": FieldRule("boolean", required=False),
            "public_visible": FieldRule("boolean", required=False),
        },
    },
    ("POST", "/api/v1/admin/catalog-sync-runs"): {
        "body": {"source": FieldRule("enum", choices=("KTOUR_API",))}
    },
    ("POST", "/api/v1/admin/dual-approvals"): {
        "body": {
            "action_type": FieldRule("enum", choices=("POINT_ADJUSTMENT", "SEASON_FINALIZATION")),
            "subject_id": UUID_RULE,
        }
    },
    ("POST", "/api/v1/admin/dual-approvals/{id}/approve"): {
        "body": {}, "states": ("pending",)
    },
    ("POST", "/api/v1/admin/point-adjustments"): {
        "body": {
            "user_id": UUID_RULE,
            "fandom_id": UUID_RULE,
            "place_id": UUID_RULE,
            "season_id": UUID_RULE,
            "points": FieldRule("integer", minimum=-10000, maximum=10000),
            "reason_ko": FieldRule("korean", min_length=10, max_length=1000),
            "dual_approval_id": UUID_RULE,
        }
    },
    ("POST", "/api/v1/admin/dlq/{id}/retry"): {
        "body": {}, "forbidden_states": ("resolved",)
    },
    ("POST", "/api/v1/admin/seasons/{id}/finalize"): {
        "body": {"dual_approval_id": UUID_RULE},
        "forbidden_states": ("finalized",),
    },
}


def _template_for(method: str, path: str) -> str | None:
    for contract_method, template in WRITE_CONTRACTS:
        pattern = "^" + re.escape(template).replace(r"\{id\}", r"[^/]+") + "$"
        if contract_method == method.upper() and re.fullmatch(pattern, path.partition("?")[0]):
            return template
    return None


def _error(status: int, code: str, field: str | None = None) -> ValidationError:
    return ValidationError(status, code, field)


def _uuid_v4(value: str) -> bool:
    try:
        parsed = UUID(value)
    except (ValueError, AttributeError, TypeError):
        return False
    return parsed.version == 4 and str(parsed) == value.lower()


def _validate_field(name: str, value: object, rule: FieldRule) -> ValidationError | None:
    kind = rule.kind
    if kind in {"uuid", "korean", "enum", "timestamp", "https"} and not isinstance(value, str):
        return _error(400, "MALFORMED_REQUEST", name)
    if kind == "integer" and (not isinstance(value, int) or isinstance(value, bool)):
        return _error(400, "MALFORMED_REQUEST", name)
    if kind == "number" and (not isinstance(value, (int, float)) or isinstance(value, bool)):
        return _error(400, "MALFORMED_REQUEST", name)
    if kind == "boolean" and not isinstance(value, bool):
        return _error(400, "MALFORMED_REQUEST", name)

    if isinstance(value, float) and not math.isfinite(value):
        return _error(422, "VALIDATION_FAILED", name)
    if rule.max_length is not None and isinstance(value, str) and len(value) > rule.max_length:
        return _error(413, "PAYLOAD_TOO_LARGE", name)
    if rule.min_length is not None and isinstance(value, str) and len(value) < rule.min_length:
        return _error(422, "VALIDATION_FAILED", name)
    if rule.minimum is not None and isinstance(value, (int, float)) and value < rule.minimum:
        return _error(422, "VALIDATION_FAILED", name)
    if rule.maximum is not None and isinstance(value, (int, float)) and value > rule.maximum:
        return _error(422, "VALIDATION_FAILED", name)

    if kind == "uuid" and not _uuid_v4(value):
        return _error(422, "VALIDATION_FAILED", name)
    if kind == "enum" and value not in rule.choices:
        return _error(422, "VALIDATION_FAILED", name)
    if kind == "korean":
        if unicodedata.normalize("NFC", value) != value or not re.search(r"[가-힣]", value):
            return _error(422, "VALIDATION_FAILED", name)
    if kind == "https":
        parsed = urlparse(value)
        if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
            return _error(422, "VALIDATION_FAILED", name)
    if kind == "timestamp":
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return _error(422, "VALIDATION_FAILED", name)
        if not value.endswith("Z") or parsed.tzinfo != timezone.utc:
            return _error(422, "VALIDATION_FAILED", name)
    return None


def _decode_body(body: object) -> tuple[dict[str, object] | None, ValidationError | None]:
    if isinstance(body, (str, bytes, bytearray)):
        try:
            body = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None, _error(400, "MALFORMED_REQUEST")
    if not isinstance(body, dict):
        return None, _error(400, "MALFORMED_REQUEST")
    return body, None


def _validate_photo(file: object) -> ValidationError | None:
    if not isinstance(file, dict) or set(file) != {"content", "mime_type"}:
        return _error(400, "MALFORMED_REQUEST", "file")
    content, mime = file["content"], file["mime_type"]
    if not isinstance(content, bytes) or not isinstance(mime, str):
        return _error(400, "MALFORMED_REQUEST", "file")
    allowed = {"image/jpeg", "image/png", "image/webp"}
    if mime not in allowed:
        return _error(415, "UNSUPPORTED_MEDIA_TYPE", "file")
    if len(content) > 10_485_760:
        return _error(413, "PAYLOAD_TOO_LARGE", "file")
    decoders = {
        "image/jpeg": _decodes_jpeg,
        "image/png": _decodes_png,
        "image/webp": _decodes_webp,
    }
    if not content or not decoders[mime](content):
        return _error(415, "UNSUPPORTED_MEDIA_TYPE", "file")
    return None


def _decodes_png(content: bytes) -> bool:
    if not content.startswith(b"\x89PNG\r\n\x1a\n"):
        return False
    offset, saw_header, saw_data = 8, False, False
    while offset + 12 <= len(content):
        length = int.from_bytes(content[offset : offset + 4], "big")
        end = offset + 12 + length
        if end > len(content):
            return False
        kind = content[offset + 4 : offset + 8]
        data = content[offset + 8 : offset + 8 + length]
        expected_crc = int.from_bytes(content[offset + 8 + length : end], "big")
        if zlib.crc32(kind + data) & 0xFFFFFFFF != expected_crc:
            return False
        if kind == b"IHDR":
            if saw_header or length != 13 or int.from_bytes(data[:4], "big") == 0 or int.from_bytes(data[4:8], "big") == 0:
                return False
            saw_header = True
        elif kind == b"IDAT":
            saw_data = True
        elif kind == b"IEND":
            return saw_header and saw_data and length == 0 and end == len(content)
        offset = end
    return False


def _decodes_jpeg(content: bytes) -> bool:
    if len(content) < 8 or content[:2] != b"\xff\xd8" or content[-2:] != b"\xff\xd9":
        return False
    # A decodable still image needs a frame header and scan data, not merely
    # the SOI/EOI magic bytes. Segment bounds are checked before inspection.
    offset, saw_frame, saw_scan = 2, False, False
    while offset + 1 < len(content) - 2:
        if content[offset] != 0xFF:
            offset += 1 if saw_scan else len(content)
            continue
        marker = content[offset + 1]
        offset += 2
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            continue
        if offset + 2 > len(content) - 2:
            return False
        length = int.from_bytes(content[offset : offset + 2], "big")
        if length < 2 or offset + length > len(content):
            return False
        if marker in (0xC0, 0xC1, 0xC2):
            if length < 8 or content[offset + 3 : offset + 7] == b"\0\0\0\0":
                return False
            saw_frame = True
        if marker == 0xDA:
            saw_scan = True
        offset += length
    return saw_frame and saw_scan


def _decodes_webp(content: bytes) -> bool:
    if len(content) < 20 or content[:4] != b"RIFF" or content[8:12] != b"WEBP":
        return False
    declared_size = int.from_bytes(content[4:8], "little") + 8
    return declared_size == len(content) and content[12:16] in (b"VP8 ", b"VP8L", b"VP8X")


def validate_write_request(
    method: str,
    path: str,
    *,
    body: object,
    headers: dict[str, object] | None = None,
    content_type: str | None = None,
    files: list[object] | None = None,
    resource_state: str | None = None,
    semantic_context: dict[str, object] | None = None,
) -> ValidationError | None:
    """Validate one declared write request in deterministic precedence order."""

    template = _template_for(method, path)
    if template is None:
        return None
    contract = WRITE_CONTRACTS[(method.upper(), template)]
    headers = {key.lower(): value for key, value in (headers or {}).items()}

    expected_type = "multipart/form-data" if contract.get("multipart") else "application/json"
    if not isinstance(content_type, str) or content_type.partition(";")[0].strip().lower() != expected_type:
        return _error(415, "UNSUPPORTED_MEDIA_TYPE")

    if contract.get("idempotency"):
        key = headers.get("idempotency-key")
        if not isinstance(key, str):
            return _error(422, "VALIDATION_FAILED", "Idempotency-Key")
        if len(key) > 36:
            return _error(413, "PAYLOAD_TOO_LARGE", "Idempotency-Key")
        if not _uuid_v4(key):
            return _error(422, "VALIDATION_FAILED", "Idempotency-Key")

    decoded_body: dict[str, object] | None = None
    if contract.get("multipart"):
        if body not in ({}, None):
            return _error(400, "MALFORMED_REQUEST")
        if not isinstance(files, list):
            return _error(400, "MALFORMED_REQUEST", "file")
        if len(files) != 1:
            return _error(422, "VALIDATION_FAILED", "file")
        error = _validate_photo(files[0])
        if error:
            return error
    else:
        decoded, error = _decode_body(body)
        if error:
            return error
        assert decoded is not None
        decoded_body = decoded
        rules = contract["body"]
        assert isinstance(rules, dict)
        if any(name not in rules for name in decoded):
            return _error(400, "MALFORMED_REQUEST")
        for name, rule in rules.items():
            assert isinstance(rule, FieldRule)
            if rule.required and name not in decoded:
                return _error(422, "VALIDATION_FAILED", name)
        if contract.get("at_least_one") and not decoded:
            return _error(422, "VALIDATION_FAILED")
        for name, value in decoded.items():
            error = _validate_field(name, value, rules[name])
            if error:
                return error

    if resource_state is not None:
        if resource_state in contract.get("forbidden_states", ()):
            return _error(422, "VALIDATION_FAILED", "state")
        allowed = contract.get("states")
        if allowed and resource_state not in allowed:
            return _error(422, "VALIDATION_FAILED", "state")
    context = semantic_context or {}
    semantic_error = _validate_semantics(template, context, decoded_body)
    if semantic_error is not None:
        return semantic_error
    return None


def _validate_semantics(
    template: str,
    context: dict[str, object],
    request_body: dict[str, object] | None,
) -> ValidationError | None:
    """Apply stateful rules when an adapter supplies the authoritative facts.

    Missing facts are not guessed at this boundary; service handlers remain
    responsible for loading them transactionally and supplying them here.
    """

    def is_false(name: str) -> bool:
        return name in context and context[name] is False

    def is_true(name: str) -> bool:
        return context.get(name) is True

    if template == "/api/v1/me/season-membership":
        if is_false("season_active") or is_true("membership_locked"):
            return _error(422, "VALIDATION_FAILED", "state")
    elif template == "/api/v1/checkin-sessions":
        required_true = ("user_active", "place_active", "season_active", "catalog_usable")
        if any(is_false(name) for name in required_true):
            return _error(422, "VALIDATION_FAILED", "state")
        attempts = context.get("daily_attempt_count")
        if isinstance(attempts, int) and attempts >= 3:
            return _error(422, "VALIDATION_FAILED", "state")
    elif template == "/api/v1/checkin-sessions/{id}/gps-samples":
        if is_false("session_open") or is_false("foreground_active"):
            return _error(422, "VALIDATION_FAILED", "state")
        sequence = request_body.get("sample_sequence") if request_body is not None else None
        previous = context.get("previous_sequence")
        if isinstance(sequence, int) and isinstance(previous, int) and sequence != previous + 1:
            return _error(422, "VALIDATION_FAILED", "sample_sequence")
        if is_false("captured_within_session") or is_false("captured_not_over_30s_future"):
            return _error(422, "VALIDATION_FAILED", "captured_at")
    elif template == "/api/v1/checkin-sessions/{id}/photo":
        if is_false("session_open") or is_false("captured_in_session_camera"):
            return _error(422, "VALIDATION_FAILED", "state")
    elif template == "/api/v1/checkins/{id}/appeals":
        if is_false("within_48_hours"):
            return _error(422, "VALIDATION_FAILED", "state")
        count = context.get("appeal_count")
        if isinstance(count, int) and count >= 1:
            return _error(422, "VALIDATION_FAILED", "state")
    elif template == "/api/v1/admin/review-tasks/{id}":
        if is_false("transition_allowed"):
            return _error(422, "VALIDATION_FAILED", "state")
    elif template == "/api/v1/admin/places/{id}":
        if is_true("reenabling") and is_false("rights_valid"):
            return _error(422, "VALIDATION_FAILED", "state")
    elif template == "/api/v1/admin/dual-approvals":
        if is_true("duplicate_active_request"):
            return _error(422, "VALIDATION_FAILED", "state")
    elif template == "/api/v1/admin/dual-approvals/{id}/approve":
        if is_true("same_requester_and_approver"):
            return _error(422, "VALIDATION_FAILED", "state")
    elif template == "/api/v1/admin/point-adjustments":
        if is_false("dual_approval_valid"):
            return _error(422, "VALIDATION_FAILED", "dual_approval_id")
    elif template == "/api/v1/admin/seasons/{id}/finalize":
        if is_false("review_grace_ended") or is_false("dual_approval_valid"):
            return _error(422, "VALIDATION_FAILED", "state")
    return None
