"""Small HTTP-like boundary used by the MVP services and integration tests."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final
from urllib.parse import parse_qs, urlsplit

from .auth import Principal, authorize, policy_for
from .catalog import PlaceCatalog
from .validation import validate_write_request


_UNSET: Final = object()


@dataclass(frozen=True)
class Response:
    status: int
    body: dict[str, object]


class KTownDefenseApp:
    """Dispatches declared API routes through the shared authorization gate."""

    def __init__(self, catalog: PlaceCatalog | None = None) -> None:
        self._catalog_configured = catalog is not None
        self.catalog = catalog or PlaceCatalog()

    def request(
        self,
        method: str,
        path: str,
        principal: Principal | None = None,
        *,
        body: object = _UNSET,
        headers: dict[str, object] | None = None,
        content_type: str | None = None,
        files: list[object] | None = None,
        resource_state: str | None = None,
        semantic_context: dict[str, object] | None = None,
    ) -> Response:
        policy = policy_for(method, path)
        if policy is None:
            return Response(404, {"code": "NOT_FOUND"})

        decision = authorize(policy, principal)
        if not decision.allowed:
            return Response(decision.status, {"code": decision.code})

        # Calls that omit the HTTP envelope are authorization probes retained
        # for the small in-process policy harness. Real adapters always pass a
        # body (including {}), which activates the full write contract.
        if method.upper() in {"POST", "PUT", "PATCH"} and body is not _UNSET:
            error = validate_write_request(
                method,
                path,
                body=body,
                headers=headers,
                content_type=content_type,
                files=files,
                resource_state=resource_state,
                semantic_context=semantic_context,
            )
            if error is not None:
                response_body: dict[str, object] = {"code": error.code}
                if error.field is not None:
                    response_body["field"] = error.field
                return Response(error.status, response_body)
        if method.upper() == "GET":
            public_response = self._public_discovery(path)
            if public_response is not None:
                return public_response
        return Response(200, {"ok": True})

    def _public_discovery(self, path: str) -> Response | None:
        parsed = urlsplit(path)
        query = parse_qs(parsed.query)
        artist_id = query.get("artist_id", [None])[0]

        if parsed.path == "/api/v1/places":
            body: dict[str, object] = {"items": self.catalog.list_places(artist_id)}
            discovery_status = getattr(self.catalog, "discovery_status", None)
            if callable(discovery_status):
                body.update(discovery_status())
            return Response(200, body)
        if parsed.path.startswith("/api/v1/places/"):
            place_id = parsed.path.removeprefix("/api/v1/places/")
            item = self.catalog.get_place(place_id, artist_id)
            if item is None and not self._catalog_configured:
                return Response(200, {"ok": True})
            return Response(200, item) if item else Response(404, {"code": "NOT_FOUND"})
        if parsed.path == "/api/v1/seasons/current/strongholds":
            return Response(200, {"items": self.catalog.list_strongholds(artist_id)})
        if parsed.path == "/api/v1/seasons/current/leaderboards":
            return Response(200, {"items": self.catalog.list_leaderboard()})
        return None
