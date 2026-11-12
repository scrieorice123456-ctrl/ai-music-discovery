"""Explainable hybrid recommendations, with no paid/LLM dependencies.

Content affinity + artist proximity + recency-weighted implicit/explicit feedback.
The three disjoint lanes use largest-remainder quotas and a diversity reranker.
"""

import hashlib
import math
from collections import Counter
from datetime import datetime, timezone

LANES = ("similar", "discovery", "experimental")


def recency_weight(value):
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        dt = dt.replace(tzinfo=dt.tzinfo or timezone.utc)
        days = max(0, (datetime.now(timezone.utc) - dt).total_seconds() / 86400)
        return 0.35 + 0.65 * math.exp(-days / 120)
    except (ValueError, TypeError, AttributeError):
        return 0.65


def build_profile(history, feedback, tracks):
    by_id = {t["id"]: t for t in tracks}
    artist = Counter()
    genre = Counter()
    family = Counter()
    mood = Counter()
    signals = Counter()
    hours = Counter()
    known = set()
    known_keys = set()
    known_videos = set()
    for event in history:
        track = by_id.get(event["track_id"])
        if not track:
            continue
        known.add(track["id"])
        known_keys.add(track["normalized_key"])
        if track.get("video_id"):
            known_videos.add(track["video_id"])
        signals[track["id"]] += recency_weight(event.get("listened_at"))
        try:
            hours[
                datetime.fromisoformat(event["listened_at"].replace("Z", "+00:00")).hour
            ] += 1
        except (ValueError, TypeError, KeyError, AttributeError):
            pass
    excluded = set(known)
    for f in feedback:
        tid = f["track_id"]
        pref = f.get("preference")
        if pref in ("known", "dislike") or f.get("skips", 0) >= 3:
            excluded.add(tid)
        if pref == "known":
            known.add(tid)
        if pref == "like":
            signals[tid] += 5
        elif pref == "dislike":
            signals[tid] -= 3
        signals[tid] += (
            0.8 * f.get("saved", 0)
            + min(3, f.get("plays", 0)) * 0.3
            - min(2, f.get("skips", 0)) * 0.3
        )
    energy_total = 0
    total = 0
    for tid, raw in signals.items():
        t = by_id.get(tid)
        if not t:
            continue
        # Saturating play count stops a single heavily repeated track dominating.
        weight = math.copysign(math.log1p(abs(raw)), raw)
        artist[t["artist"]] += weight
        family[t.get("family", "")] += weight
        for tag in t["genres"]:
            genre[tag] += weight / max(1, len(t["genres"]))
        for tag in set(t["moods"]):
            mood[tag] += weight / max(1, len(t["moods"]))
        if weight > 0:
            energy_total += t["energy"] * weight
            total += weight
    return {
        "artists": artist,
        "genres": genre,
        "families": family,
        "moods": mood,
        "energy": energy_total / total if total else 0.5,
        "known": known,
        "excluded": excluded,
        "known_keys": known_keys,
        "known_videos": known_videos,
        "hours": hours,
        "history_count": len(history),
        "feedback_count": len(feedback),
    }


def quotas(weights, count):
    total = sum(weights.values())
    if total <= 0:
        weights = {"similar": 50, "discovery": 30, "experimental": 20}
        total = 100
    raw = {k: count * weights.get(k, 0) / total for k in LANES}
    result = {k: int(v) for k, v in raw.items()}
    for k in sorted(LANES, key=lambda k: raw[k] - result[k], reverse=True)[
        : count - sum(result.values())
    ]:
        result[k] += 1
    return result


def recommend(
    tracks, profile, weights, count=20, mood="all", seed="daily", exclude=None
):
    artists = profile["artists"]
    genres = profile["genres"]
    families = profile["families"]
    max_artist = max([1, *artists.values()])
    max_genre = max([1, *genres.values()])
    excluded = profile["excluded"] | set(exclude or [])
    pools = {k: [] for k in LANES}
    for track in tracks:
        if track["id"] in excluded or track["normalized_key"] in profile["known_keys"]:
            continue
        if track.get("video_id") and track["video_id"] in profile["known_videos"]:
            continue
        # Unknown imported metadata is not a discovery candidate until enriched.
        if track.get("source") == "import":
            continue
        if mood != "all" and mood not in track["moods"]:
            continue
        artist_affinity = max(0, artists.get(track["artist"], 0)) / max_artist
        tag_affinity = sum(
            max(0, genres.get(g, 0)) / max_genre for g in track["genres"]
        ) / max(1, len(track["genres"]))
        energy_affinity = 1 - abs(track["energy"] - profile["energy"])
        family_affinity = max(0, families.get(track.get("family", ""), 0)) / max(
            [1, *families.values()]
        )
        affinity = (
            0.36 * artist_affinity
            + 0.35 * tag_affinity
            + 0.19 * energy_affinity
            + 0.1 * family_affinity
        )
        if artist_affinity > 0:
            lane = "similar"
        elif tag_affinity >= 0.16 or family_affinity > 0.05:
            lane = "discovery"
        else:
            lane = "experimental"
        # Stable daily variety; not random fabricated match percentages.
        jitter = (
            int(hashlib.sha256(f"{seed}:{track['id']}".encode()).hexdigest()[:8], 16)
            / 0xFFFFFFFF
        )
        rank = affinity + 0.075 * jitter
        if lane == "experimental":
            rank = 0.5 * energy_affinity + 0.25 * tag_affinity + 0.25 * jitter
        top_tags = sorted(track["genres"], key=lambda g: genres.get(g, 0), reverse=True)
        if lane == "similar":
            reason = f"A fresh pick from {track['artist']}, an artist your listening and feedback connect you with."
        elif lane == "discovery" and top_tags and genres.get(top_tags[0], 0) > 0:
            reason = f"A new-to-you artist with the {top_tags[0]} textures you gravitate toward."
        else:
            reason = f"A step beyond your usual sound, connected by its {('gentle' if track['energy'] < 0.45 else 'steady' if track['energy'] < 0.7 else 'upbeat')} energy."
        item = {
            **track,
            "lane": lane,
            "affinity": round(affinity, 4),
            "reason": reason,
            "factors": [
                f"{top_tags[0].title()} influence" if top_tags else "New sound",
                f"{'Low' if track['energy'] < 0.4 else 'Medium' if track['energy'] < 0.7 else 'High'} energy (editorial)"
                if track.get("source") == "editorial"
                else "Energy not analyzed",
                "Not in your imported history",
            ],
        }
        pools[lane].append((rank, item))
    for lane in LANES:
        pools[lane].sort(key=lambda x: x[0], reverse=True)
    target = quotas(weights, count)
    selected = {k: [] for k in LANES}
    artist_counts = Counter()
    used = set()
    # Meet quotas first. Rerank for artist diversity where sufficient candidates exist.
    for lane in LANES:
        for diversify in (True, False):
            for _, item in pools[lane]:
                if len(selected[lane]) >= target[lane]:
                    break
                if item["id"] in used or (
                    diversify and artist_counts[item["artist"]] >= 1
                ):
                    continue
                selected[lane].append(item)
                used.add(item["id"])
                artist_counts[item["artist"]] += 1
    result = []
    # Interleave rather than front-loading the familiar lane.
    while any(selected.values()):
        for lane in LANES:
            if selected[lane]:
                result.append(selected[lane].pop(0))
    if len(result) < count:
        # Sparse catalogs cannot promise exact quotas; disclose actual mix in API/UI.
        remaining = sorted(
            [
                entry
                for lane in LANES
                if weights.get(lane, 0) > 0
                for entry in pools[lane]
                if entry[1]["id"] not in used
            ],
            key=lambda e: e[0],
            reverse=True,
        )
        for _, item in remaining:
            if len(result) >= count:
                break
            result.append(item)
    return result
