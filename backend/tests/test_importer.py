import io
import json
import zipfile
import pytest
from backend.app.importer import ImportError, parse_takeout, youtube_id
from backend.app.config import settings
from backend.app.catalog import normalize, track_key


def event(**extra):
    return {
        "header": "YouTube Music",
        "title": "Watched Bonobo - Kerala (Official Audio)",
        "titleUrl": "https://music.youtube.com/watch?v=abcdefghijk",
        "time": "2026-10-12T20:30:00Z",
        "subtitles": [{"name": "Bonobo - Topic"}],
        **extra,
    }


def test_json_normalizes_artist_title_and_date():
    result = parse_takeout("watch-history.json", json.dumps([event()]).encode())
    e = result.events[0]
    assert e["artist"] == "Bonobo" and e["title"] == "Kerala"
    assert e["listened_at"] == "2026-10-12T20:30:00+00:00"
    assert e["video_id"] == "abcdefghijk"
    assert len(e["event_key"]) == 64


def test_export_shape_and_unicode():
    result = parse_takeout(
        "music.json",
        json.dumps(
            {
                "history": [
                    {
                        "artist": "宇多田ヒカル",
                        "title": "光",
                        "listened_at": "2025-01-01T00:00:00Z",
                    }
                ]
            }
        ).encode(),
    )
    assert result.events[0]["artist"] == "宇多田ヒカル"
    assert normalize("宇多田ヒカル") == "宇多田ヒカル"
    assert track_key("東京", "光") != track_key("京都", "雨")
    assert normalize("Ólafur Arnalds") == "olafur arnalds"


def test_combined_youtube_folder_is_not_a_music_signal():
    records = [
        {
            "header": "YouTube",
            "title": "Watched How to fix a bike",
            "titleUrl": "https://www.youtube.com/watch?v=12345678901",
        },
        event(),
    ]
    result = parse_takeout(
        "Takeout/YouTube and YouTube Music/history/watch-history.json",
        json.dumps(records).encode(),
    )
    assert len(result.events) == 1 and result.skipped == 1
    included = parse_takeout("watch-history.json", json.dumps(records).encode(), True)
    assert len(included.events) == 2


def test_html_google_takeout_structure():
    html = b"""<div class="outer-cell"><p>YouTube Music</p><div class="content-cell">Watched <a href="https://music.youtube.com/watch?v=abcdefghijk">Kerala (Official Audio)</a><br><a href="https://www.youtube.com/channel/example">Bonobo - Topic</a><br>Oct 12, 2026, 8:30:00 PM UTC</div></div><script>window.location='evil';</script>"""
    result = parse_takeout("history.html", html)
    assert len(result.events) == 1
    assert result.events[0]["artist"] == "Bonobo"
    assert result.events[0]["title"] == "Kerala"
    assert result.events[0]["listened_at"].startswith("2026-10-12T20:30:00")


def test_html_content_cell_fallback_and_missing_dates():
    html = b'<div class="content-cell">Watched <a href="https://music.youtube.com/watch?v=abcdefghijk">Bonobo - Cirrus</a></div>'
    result = parse_takeout("watch-history.html", html)
    assert result.events[0]["title"] == "Cirrus"
    assert result.warnings


def test_csv_semicolon_and_aliases():
    content = (
        "track name;artist name;date\nNear Light;Ólafur Arnalds;2026-01-01\n".encode()
    )
    result = parse_takeout("listening.csv", content)
    assert result.events[0]["title"] == "Near Light"
    assert result.events[0]["artist"] == "Ólafur Arnalds"


def test_zip_reads_without_extraction_and_skips_non_history_files():
    blob = io.BytesIO()
    with zipfile.ZipFile(blob, "w") as z:
        z.writestr(
            "Takeout/YouTube Music/history/watch-history.json", json.dumps([event()])
        )
        z.writestr("photo.png", b"not an image")
    result = parse_takeout("Takeout.zip", blob.getvalue())
    assert result.files == 1 and len(result.events) == 1


@pytest.mark.parametrize(
    "name",
    [
        "../private.json",
        "/etc/music.json",
        "folder/../../music.json",
        "..\\escape.json",
    ],
)
def test_zip_rejects_traversal(name):
    blob = io.BytesIO()
    with zipfile.ZipFile(blob, "w") as z:
        z.writestr(name, json.dumps([event()]))
    with pytest.raises(ImportError, match="Unsafe"):
        parse_takeout("history.zip", blob.getvalue())


def test_zip_rejects_symlink():
    blob = io.BytesIO()
    with zipfile.ZipFile(blob, "w") as z:
        i = zipfile.ZipInfo("music.json")
        i.create_system = 3
        i.external_attr = 0o120777 << 16
        z.writestr(i, "/etc/passwd")
    with pytest.raises(ImportError, match="symbolic"):
        parse_takeout("history.zip", blob.getvalue())


def test_zip_safe_uncompressed_limit(monkeypatch):
    monkeypatch.setattr(settings, "max_uncompressed", 100)
    blob = io.BytesIO()
    with zipfile.ZipFile(blob, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("music.json", json.dumps([event()]))
    with pytest.raises(ImportError, match="uncompressed"):
        parse_takeout("history.zip", blob.getvalue())


@pytest.mark.parametrize(
    "filename,content,message",
    [
        ("data.exe", b"123", "Choose"),
        ("music.json", b"not json", "invalid"),
        ("history.zip", b"not zip", "damaged"),
        ("music.json", b"[]", "No music"),
        ("music.json", b"", "empty"),
        ("music.json", b"\xff\xff", "UTF-8"),
        ("data.csv", b"foo,bar\n1,2", "CSV must"),
    ],
)
def test_invalid_inputs(filename, content, message):
    with pytest.raises(ImportError, match=message):
        parse_takeout(filename, content)


def test_limits_number_of_events(monkeypatch):
    monkeypatch.setattr(settings, "max_events", 2)
    with pytest.raises(ImportError, match="exceeds"):
        parse_takeout("music.json", json.dumps([event()] * 3).encode())


def test_only_accepts_real_youtube_hosts_and_ids():
    assert youtube_id("https://youtu.be/abcdefghijk") == "abcdefghijk"
    assert youtube_id("https://music.youtube.com/watch?v=abcdefghijk") == "abcdefghijk"
    assert youtube_id("https://youtube.com.evil.test/watch?v=abcdefghijk") is None
    assert youtube_id("https://youtube.com/watch?v=short") is None
