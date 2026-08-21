from httpx import ASGITransport, AsyncClient

from ktown_defense.api.main import create_app
from ktown_defense.settings import Settings


async def test_health_reports_service_status() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=create_app()),
        base_url="http://test",
    ) as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"service": "ktown-defense", "status": "ok"}


def test_settings_read_the_existing_ktour_key_name(monkeypatch) -> None:
    monkeypatch.setenv("KTOUR_SERVICE_KEY", "secret-value")

    settings = Settings(_env_file=None)

    assert settings.ktour_service_key is not None
    assert settings.ktour_service_key.get_secret_value() == "secret-value"
