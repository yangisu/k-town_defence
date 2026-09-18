from httpx import ASGITransport, AsyncClient

from ktown_defense.api.main import create_app
from ktown_defense.settings import Settings
from tests.conftest import DATABASE_URL


async def _client_with_secret(
    session_factory, upload_dir, monkeypatch, secret: str | None
) -> AsyncClient:
    if secret is None:
        monkeypatch.delenv("KTOWN_GATEWAY_SECRET", raising=False)
    else:
        monkeypatch.setenv("KTOWN_GATEWAY_SECRET", secret)
    app = create_app(
        Settings(database_url=DATABASE_URL, upload_dir=upload_dir, _env_file=None)
    )
    app.state.session_factory = session_factory
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_request_without_secret_is_rejected_when_configured(
    session_factory, upload_dir, public_place, monkeypatch
) -> None:
    async with await _client_with_secret(
        session_factory, upload_dir, monkeypatch, "correct-secret"
    ) as client:
        response = await client.get(f"/api/v1/places/{public_place.id}")

    assert response.status_code == 401
    assert response.json()["code"] == "GATEWAY_AUTH_REQUIRED"


async def test_request_with_wrong_secret_is_rejected(
    session_factory, upload_dir, public_place, monkeypatch
) -> None:
    async with await _client_with_secret(
        session_factory, upload_dir, monkeypatch, "correct-secret"
    ) as client:
        response = await client.get(
            f"/api/v1/places/{public_place.id}",
            headers={"X-KTown-Gateway-Secret": "wrong-secret"},
        )

    assert response.status_code == 401
    assert response.json()["code"] == "GATEWAY_AUTH_REQUIRED"


async def test_request_with_correct_secret_is_allowed(
    session_factory, upload_dir, public_place, monkeypatch
) -> None:
    async with await _client_with_secret(
        session_factory, upload_dir, monkeypatch, "correct-secret"
    ) as client:
        response = await client.get(
            f"/api/v1/places/{public_place.id}",
            headers={"X-KTown-Gateway-Secret": "correct-secret"},
        )

    assert response.status_code == 200


async def test_health_endpoints_stay_open_without_the_secret(
    session_factory, upload_dir, monkeypatch
) -> None:
    async with await _client_with_secret(
        session_factory, upload_dir, monkeypatch, "correct-secret"
    ) as client:
        health = await client.get("/health")
        ready = await client.get("/health/ready")

    assert health.status_code == 200
    assert ready.status_code == 200


async def test_no_secret_configured_leaves_requests_unrestricted(
    session_factory, upload_dir, public_place, monkeypatch
) -> None:
    async with await _client_with_secret(
        session_factory, upload_dir, monkeypatch, None
    ) as client:
        response = await client.get(f"/api/v1/places/{public_place.id}")

    assert response.status_code == 200
