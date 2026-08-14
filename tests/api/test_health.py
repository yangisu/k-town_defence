from urllib.parse import urlparse

from fastapi.testclient import TestClient

from ktown_defense.api.main import create_app
from ktown_defense.settings import Settings


def test_health_returns_service_identity():
    response = TestClient(create_app()).get("/health")

    assert response.status_code == 200
    assert response.json() == {"service": "ktown-defense", "status": "ok"}


def test_default_database_url_does_not_embed_credentials():
    database_url = Settings(_env_file=None).database_url
    parsed_url = urlparse(database_url)

    assert parsed_url.username is None
    assert parsed_url.password is None
