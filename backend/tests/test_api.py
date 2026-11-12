import json
from fastapi.testclient import TestClient
from backend.app.main import app
from .test_importer import event


def upload(client, session, records=None, filename="music.json"):
    return client.post(
        "/api/import",
        headers=session,
        files={
            "file": (filename, json.dumps(records or [event()]), "application/json")
        },
    )


def test_health_security_and_session(client, session):
    assert client.get("/api/health").json()["status"] == "ok"
    response = client.get("/api/bootstrap")
    assert response.json()["demo"] is True
    assert "script-src" in response.headers["content-security-policy"]
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.json()["settings"] == {
        "similar": 50,
        "discovery": 30,
        "experimental": 20,
    }


def test_csrf_required_and_bound_to_session(client, session):
    assert (
        client.post("/api/feedback", json={"track_id": 1, "action": "like"}).status_code
        == 403
    )
    assert (
        client.put(
            "/api/settings",
            headers={"x-csrf-token": "wrong"},
            json={"similar": 50, "discovery": 30, "experimental": 20},
        ).status_code
        == 403
    )


def test_import_replaces_sample_atomically_and_deduplicates(client, session):
    first = upload(client, session)
    assert first.status_code == 200
    assert first.json()["imported"] == 1
    assert client.get("/api/bootstrap").json()["demo"] is False
    assert client.get("/api/bootstrap").json()["taste"]["plays"] == 1
    second = upload(client, session)
    assert second.json()["imported"] == 0 and second.json()["duplicates"] == 1
    result = client.get("/api/discover").json()
    assert all(t["title"] != "Kerala" for t in result["tracks"])
    history = client.get("/api/library?view=history").json()["tracks"]
    assert len(history) == 1 and history[0]["title"] == "Kerala"


def test_invalid_import_preserves_sample(client, session):
    before = client.get("/api/bootstrap").json()["taste"]["plays"]
    bad = client.post(
        "/api/import",
        headers=session,
        files={"file": ("music.json", b"{bad", "application/json")},
    )
    assert bad.status_code == 422
    assert client.get("/api/bootstrap").json()["demo"] is True
    assert client.get("/api/bootstrap").json()["taste"]["plays"] == before


def test_repeat_plays_preserved_as_separate_events(client, session):
    response = upload(client, session, [event(), event(time="2026-10-13T20:00:00Z")])
    assert response.json()["imported"] == 2
    taste = client.get("/api/bootstrap").json()["taste"]
    assert taste["plays"] == 2 and taste["tracks"] == 1


def test_feedback_saves_likes_and_excludes_known(client, session):
    tracks = client.get("/api/discover").json()["tracks"]
    track = tracks[0]
    for action in ["save", "like"]:
        assert (
            client.post(
                "/api/feedback",
                headers=session,
                json={"track_id": track["id"], "action": action},
            ).status_code
            == 200
        )
    assert (
        client.get("/api/library?view=saved").json()["tracks"][0]["id"] == track["id"]
    )
    assert (
        client.get("/api/library?view=liked").json()["tracks"][0]["id"] == track["id"]
    )
    client.post(
        "/api/feedback",
        headers=session,
        json={"track_id": track["id"], "action": "known"},
    )
    assert track["id"] not in {
        t["id"] for t in client.get("/api/discover").json()["tracks"]
    }
    client.post(
        "/api/feedback",
        headers=session,
        json={"track_id": track["id"], "action": "unsave"},
    )
    assert client.get("/api/library?view=saved").json()["tracks"] == []


def test_skips_and_completed_previews(client, session):
    track = client.get("/api/discover").json()["tracks"][0]
    for _ in range(3):
        client.post(
            "/api/feedback",
            headers=session,
            json={"track_id": track["id"], "action": "skip"},
        )
    assert track["id"] not in {
        t["id"] for t in client.get("/api/discover").json()["tracks"]
    }
    other = client.get("/api/discover").json()["tracks"][0]
    client.post(
        "/api/feedback",
        headers=session,
        json={"track_id": other["id"], "action": "listen"},
    )
    assert other["id"] not in {
        t["id"] for t in client.get("/api/discover").json()["tracks"]
    }


def test_mix_validation_and_persistence(client, session):
    for value in [
        {"similar": 50, "discovery": 50, "experimental": 50},
        {"similar": -1, "discovery": 51, "experimental": 50},
        {"similar": True, "discovery": 49, "experimental": 50},
    ]:
        assert (
            client.put("/api/settings", headers=session, json=value).status_code == 422
        )
    mix = {"similar": 60, "discovery": 25, "experimental": 15}
    assert client.put("/api/settings", headers=session, json=mix).status_code == 200
    assert client.get("/api/bootstrap").json()["settings"] == mix


def test_radio_refill_respects_exclusions_and_exhaustion(client, session):
    first = client.post("/api/radio/queue", headers=session, json={}).json()
    ids = [t["id"] for t in first["tracks"]]
    second = client.post(
        "/api/radio/queue", headers=session, json={"exclude": ids}
    ).json()
    assert not set(ids) & {t["id"] for t in second["tracks"]}
    end = client.post(
        "/api/radio/queue", headers=session, json={"exclude": list(range(1, 1000))}
    ).json()
    assert end["exhausted"] is True


def test_search_and_unavailable_preview_are_honest(client, session):
    search = client.get("/api/search?q=bonobo").json()
    assert search["tracks"] and all("Bonobo" in t["artist"] for t in search["tracks"])
    online = client.get("/api/search?q=bonobo&online=true")
    assert online.status_code == 200 and online.json()["message"]
    response = client.get(f"/api/tracks/{search['tracks'][0]['id']}/preview")
    assert response.status_code == 200 and response.json()["available"] is False
    assert "preview_url" not in response.json()


def test_private_imports_are_isolated_and_not_enumerable(client, session):
    upload(
        client,
        session,
        [
            event(
                artist="Private Artist",
                title="Private Artist - My private recording",
                subtitles=[],
                titleUrl="",
            )
        ],
    )
    own = client.get("/api/library?view=history").json()["tracks"][0]
    with TestClient(app) as other:
        boot = other.get("/api/bootstrap").json()
        assert not other.get("/api/search?q=private").json()["tracks"]
        assert other.get(f"/api/tracks/{own['id']}/preview").status_code == 404
        assert (
            other.post(
                "/api/feedback",
                headers={"x-csrf-token": boot["csrf_token"]},
                json={"track_id": own["id"], "action": "save"},
            ).status_code
            == 404
        )
        assert "private" not in other.get("/api/profile/export").text.lower()


def test_export_and_confirmed_deletion(client, session):
    upload(client, session)
    export = client.get("/api/profile/export")
    assert export.headers["content-disposition"].startswith("attachment;")
    data = export.json()
    assert data["history"][0]["title"] == "Kerala"
    assert "csrf_token" not in data and "id" not in data
    assert (
        client.post(
            "/api/profile/reset", headers=session, json={"confirm": "no"}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/profile/reset", headers=session, json={"confirm": "DELETE MY DATA"}
        ).status_code
        == 200
    )
    b = client.get("/api/bootstrap").json()
    assert b["taste"]["plays"] == 0 and b["imports"] == [] and not b["demo"]


def test_no_unknown_api_falls_back_to_spa(client):
    assert client.get("/api/not-a-route").status_code == 404
    assert client.get("/api/tracks/999999/preview").status_code == 404


def test_genre_shares_add_to_100(client, session):
    genres = client.get("/api/bootstrap").json()["taste"]["genres"]
    assert sum(g["value"] for g in genres) == 100


def test_catalog_refresh_has_a_real_job_and_cooldown(client, session):
    response = client.post("/api/catalog/refresh", headers=session)
    assert response.status_code == 200
    import time

    for _ in range(20):
        result = client.get("/api/catalog/status").json()
        if result["status"] != "running":
            break
        time.sleep(0.01)
    assert result["status"] == "complete" and result["found"] == 0
    assert "unreachable" in result["message"]
    assert client.post("/api/catalog/refresh", headers=session).status_code == 429


def test_content_length_limit(client, session, monkeypatch):
    from backend.app.config import settings

    monkeypatch.setattr(settings, "max_upload", 10)
    response = client.post(
        "/api/import",
        headers={**session, "content-length": str(2 * 1024 * 1024)},
        content=b"",
    )
    assert response.status_code == 413


def test_streamed_body_limit_cannot_be_bypassed(client, session, monkeypatch):
    from backend.app.config import settings

    monkeypatch.setattr(settings, "max_upload", 10)
    response = client.post(
        "/api/feedback",
        headers={**session, "content-type": "application/json"},
        content=iter([b"x" * 600000, b"x" * 600000]),
    )
    assert response.status_code == 413


def test_embedded_https_preview_uses_partitioned_secure_cookie(client):
    with TestClient(app, base_url="https://3000-example.e2b.app") as preview:
        response = preview.get("/api/bootstrap")
        cookie = response.headers["set-cookie"].lower()
        assert (
            "samesite=none" in cookie and "secure" in cookie and "partitioned" in cookie
        )
        token = response.json()["csrf_token"]
        result = preview.put(
            "/api/settings",
            headers={"x-csrf-token": token},
            json={"similar": 60, "discovery": 25, "experimental": 15},
        )
        assert result.status_code == 200
        assert preview.get("/api/bootstrap").json()["settings"]["similar"] == 60
