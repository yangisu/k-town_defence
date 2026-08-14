from fastapi.testclient import TestClient

from ktown_defense.api.main import create_app


def test_health_returns_service_identity():
    response = TestClient(create_app()).get("/health")

    assert response.status_code == 200
    assert response.json() == {"service": "ktown-defense", "status": "ok"}
