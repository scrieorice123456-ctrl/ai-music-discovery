from collections import Counter
from recommendation.engine import quotas, build_profile, recommend, recency_weight
from backend.app.db import database, track_dict


def catalog(client, session):
    with database() as db:
        tracks = [track_dict(r) for r in db.execute("SELECT * FROM tracks")]
        uid = client.cookies.get("music_session")
        history = [
            dict(r) for r in db.execute("SELECT * FROM history WHERE user_id=?", (uid,))
        ]
    return tracks, build_profile(history, [], tracks)


def test_default_mix_is_exact_when_catalog_allows(client, session):
    data = client.get("/api/discover").json()
    assert data["actual_mix"] == {"similar": 10, "discovery": 6, "experimental": 4}
    assert len({t["id"] for t in data["tracks"]}) == 20
    assert all(t["reason"] and t["factors"] for t in data["tracks"])


def test_excludes_listened_disliked_known_and_explicit_queue_ids(client, session):
    tracks, profile = catalog(client, session)
    first = recommend(
        tracks,
        profile,
        {"similar": 50, "discovery": 30, "experimental": 20},
        seed="test",
    )
    excluded = {first[0]["id"], first[1]["id"], first[2]["id"]}
    profile["excluded"] |= excluded
    result = recommend(
        tracks,
        profile,
        {"similar": 50, "discovery": 30, "experimental": 20},
        exclude=[first[3]["id"]],
        seed="test",
    )
    ids = {t["id"] for t in result}
    assert not ids & (excluded | profile["known"] | {first[3]["id"]})


def test_reproducible_and_diverse(client, session):
    tracks, profile = catalog(client, session)
    a = recommend(
        tracks,
        profile,
        {"similar": 50, "discovery": 30, "experimental": 20},
        seed="fixed",
    )
    b = recommend(
        tracks,
        profile,
        {"similar": 50, "discovery": 30, "experimental": 20},
        seed="fixed",
    )
    assert [t["id"] for t in a] == [t["id"] for t in b]
    assert len({t["artist"] for t in a[:4]}) == 4
    assert max(Counter(t["artist"] for t in a).values()) <= 2


def test_adjustable_zero_weights_and_moods(client, session):
    tracks, profile = catalog(client, session)
    results = recommend(
        tracks,
        profile,
        {"similar": 100, "discovery": 0, "experimental": 0},
        mood="focus",
    )
    assert results and all(
        t["lane"] == "similar" and "focus" in t["moods"] for t in results
    )


def test_feedback_changes_artist_affinity(client, session):
    tracks, profile = catalog(client, session)
    candidate = next(t for t in tracks if t["artist"] == "Jordan Rakei")
    new = build_profile(
        [],
        [
            {
                "track_id": candidate["id"],
                "preference": "like",
                "saved": 0,
                "plays": 0,
                "skips": 0,
            }
        ],
        tracks,
    )
    assert new["artists"]["Jordan Rakei"] > 0
    assert profile["artists"].get("Jordan Rakei", 0) == 0
    assert "soul" in new["genres"]


def test_cold_start_and_sparse_catalog_dont_repeat_or_crash():
    profile = build_profile([], [], [])
    assert profile["energy"] == 0.5
    assert (
        recommend([], profile, {"similar": 50, "discovery": 30, "experimental": 20})
        == []
    )


def test_largest_remainder_and_missing_dates():
    assert quotas({"similar": 50, "discovery": 30, "experimental": 20}, 20) == {
        "similar": 10,
        "discovery": 6,
        "experimental": 4,
    }
    assert (
        sum(quotas({"similar": 50, "discovery": 30, "experimental": 20}, 17).values())
        == 17
    )
    assert recency_weight(None) == 0.65
