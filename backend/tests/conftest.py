import pytest
from fastapi.testclient import TestClient
from backend.app.config import settings
from backend.app.main import app
from backend.app import providers


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database_path", str(tmp_path / "music.sqlite3"))
    monkeypatch.setattr(settings, "external_apis", False)
    providers._backoff.clear()
    with TestClient(app) as client:
        yield client


@pytest.fixture
def session(client):
    boot = client.get("/api/bootstrap").json()
    return {"x-csrf-token": boot["csrf_token"]}
