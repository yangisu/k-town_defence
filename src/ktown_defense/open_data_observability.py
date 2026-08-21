"""Safe, secret-free observations for tourism OpenAPI calls."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class OpenApiCallObservation:
    operation: str
    feature: str
    status: str
    response_count: int
    error_code: str | None
    started_at: datetime
    completed_at: datetime


def safe_error_code(message: str) -> str:
    normalized = message.upper()
    if "SERVICE_KEY" in normalized or "AUTHENTICATION" in normalized or "ERROR 30" in normalized:
        return "AUTHENTICATION_FAILED"
    if "INVALID_REQUEST" in normalized or "ERROR 10" in normalized:
        return "INVALID_REQUEST"
    if "INVALID JSON" in normalized or "CONTRACT" in normalized or "INVALID" in normalized:
        return "INVALID_RESPONSE"
    return "UPSTREAM_UNAVAILABLE"
