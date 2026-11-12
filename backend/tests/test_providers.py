import httpx
import pytest
from backend.app import providers
from backend.app.config import settings
from backend.app.db import database


def test_provider_urls_do_not_allow_arbitrary_media():
    assert providers.approved_url("https://audio-ssl.itunes.apple.com/path", "audio")
    assert providers.approved_url("https://is1-ssl.mzstatic.com/image.jpg", "art")
    assert providers.approved_url("http://music.apple.com/song") is None
    assert providers.approved_url("https://evil.example/audio.mp3", "audio") is None
    assert providers.approved_url("https://music.apple.com.evil.example/song") is None


@pytest.mark.asyncio
async def test_itunes_caches_and_keeps_audio_server_validated(
    client, session, monkeypatch
):
    monkeypatch.setattr(settings, "external_apis", True)
    calls = []
    original = httpx.AsyncClient

    async def transport(request):
        calls.append(request)
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "kind": "song",
                        "trackName": "Kerala",
                        "artistName": "Bonobo",
                        "trackId": 123,
                        "primaryGenreName": "Electronic",
                        "trackTimeMillis": 237000,
                        "trackViewUrl": "https://music.apple.com/ro/song/123",
                        "previewUrl": "https://audio-ssl.itunes.apple.com/preview.m4a",
                        "artworkUrl100": "https://is1-ssl.mzstatic.com/cover.jpg",
                    }
                ]
            },
        )

    monkeypatch.setattr(
        providers.httpx,
        "AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(transport)),
    )
    first = await providers.search_itunes("Bonobo Kerala")
    second = await providers.search_itunes("Bonobo Kerala")
    assert len(calls) == 1 and first[0]["id"] == second[0]["id"]
    assert first[0]["preview_url"].startswith("https://audio-ssl.itunes.apple.com")
    assert calls[0].url.params["country"] == "ro"
    with database() as db:
        assert db.execute("SELECT COUNT(*) FROM api_cache").fetchone()[0] == 1


@pytest.mark.asyncio
async def test_musicbrainz_public_metadata_and_identity(client, session, monkeypatch):
    monkeypatch.setattr(settings, "external_apis", True)
    original = httpx.AsyncClient
    seen = []

    async def transport(request):
        seen.append(request)
        return httpx.Response(
            200,
            json={
                "recordings": [
                    {
                        "title": "A Discovery",
                        "artist-credit": [{"name": "New Artist"}],
                        "tags": [{"name": "downtempo"}],
                        "length": 180000,
                        "releases": [{"title": "An Album"}],
                    }
                ]
            },
        )

    monkeypatch.setattr(
        providers.httpx,
        "AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(transport)),
    )
    result = await providers.discover_musicbrainz("downtempo")
    assert result[0]["source"] == "musicbrainz" and result[0]["genres"] == ["downtempo"]
    assert seen[0].headers["User-Agent"] == settings.musicbrainz_ua
    assert seen[0].url.params["fmt"] == "json"


@pytest.mark.asyncio
async def test_never_uses_a_different_artists_preview(client, session, monkeypatch):
    async def fake_search(*args):
        return [
            {
                "artist": "Wrong Artist",
                "title": "Kerala",
                "preview_url": "https://audio-ssl.itunes.apple.com/wrong.m4a",
            }
        ]

    monkeypatch.setattr(providers, "search_itunes", fake_search)
    result = await providers.preview_for({"artist": "Bonobo", "title": "Kerala"})
    assert result["available"] is False


@pytest.mark.asyncio
async def test_provider_failure_is_cached_as_backoff(client, session, monkeypatch):
    monkeypatch.setattr(settings, "external_apis", True)
    original = httpx.AsyncClient
    calls = []

    async def transport(request):
        calls.append(request)
        raise httpx.ConnectError("offline", request=request)

    monkeypatch.setattr(
        providers.httpx,
        "AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(transport)),
    )
    for _ in range(2):
        with pytest.raises(providers.ProviderUnavailable):
            await providers.search_itunes("Bonobo")
    assert len(calls) == 1
