from fastapi.testclient import TestClient

from src.api.main import app


def test_lifespan_health_and_demo_login() -> None:
    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["status"] == "ok"

        login = client.post("/auth/login", json={"username": "demo", "password": "demo"})
        assert login.status_code == 200
        assert login.json()["user"]["username"] == "demo"
        assert client.get("/auth/me").status_code == 200
