"""Data-integrity and API tests. Requires the database to be loaded (python ingest/load_db.py)."""
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("REFERENCE_DATE", "2026-10-30")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)


def get(path, **params):
    r = client.get(path, params=params)
    assert r.status_code == 200, r.text
    return r.json()


def test_health():
    assert get("/api/health")["ok"]


def test_senate_has_100_seats_two_per_state():
    seats = get("/api/senate")
    assert len(seats) == 100
    per_state = {}
    for s in seats:
        per_state.setdefault(s["state"]["abbr"], []).append(s)
    assert len(per_state) == 50 and all(len(v) == 2 for v in per_state.values())
    # the two seats of a state are in different classes -> never both up (except specials)
    for ab, v in per_state.items():
        assert v[0]["senate_class"] != v[1]["senate_class"], ab


def test_senate_up_seats_are_35_class2_plus_two_specials():
    up = [s for s in get("/api/senate") if s["seat_status"] == "up"]
    assert len(up) == 35
    assert sum(1 for s in up if s["senate_class"] == 2) == 33
    assert sorted(s["election"]["kind"] for s in up).count("special") == 2


def test_term_end_is_not_vacancy_or_candidacy():
    for s in get("/api/senate"):
        if s["seat_status"] == "up":
            assert s["holder"]["vacant"] is False
            assert s["election"]["incumbent_status"] in {
                "running", "retiring", "lost_primary", "ineligible", "term_limited", "unknown", "withdrawn", "none"}


def test_governors_50_and_36_elections():
    g = get("/api/governors")
    assert len(g) == 50
    assert sum(1 for x in g if x["election"]) == 36
    for x in g:
        if not x["election"]:
            assert x["next_election_year"] in (2027, 2028, 2029)


def test_house_current_map_has_435_voting_districts():
    h = get("/api/house", map=119)
    voting = [x for x in h if not x["delegate"]]
    assert len(voting) == 435
    assert len([x for x in h if x["delegate"]]) == 6


def test_house_2026_map_has_435_voting_districts_and_dc():
    h = get("/api/house", map=120)
    voting = [x for x in h if not x["delegate"]]
    assert len(voting) == 435
    assert all(x["election"] for x in h)


def test_vacant_is_not_open_seat_semantics():
    h = get("/api/house", map=119)
    vacant = [x for x in h if x["holder"]["vacant"]]
    for x in vacant:
        assert x["holder"]["person"] is None and x["holder"]["party"] is None


def test_candidates_and_potential_are_separate():
    for x in get("/api/house", map=120):
        e = x["election"]
        assert all(c["status"] == "declared" for c in e["candidates"])
        assert all(c["status"] == "potential" for c in e["potential_candidates"])


def test_forecasts_are_qualitative_and_attributed():
    for x in get("/api/governors"):
        if x["election"]:
            for f in x["election"]["forecasts"]:
                assert f["name"] and f["published_on"] and f["data_type"] == "estimate"
                assert "%" not in f["label"]


def test_summary_counts_add_up():
    s = get("/api/summary")
    assert sum(s["governors"].values()) == 50
    assert sum(s["senate"].values()) == 100
    assert s["house_voting_seats"] == 435


def test_date_dependent_phase():
    before = get("/api/governors", as_of="2026-10-30")
    after = get("/api/governors", as_of="2026-11-04")
    e1 = next(x["election"] for x in before if x["election"])
    e2 = next(x["election"] for x in after if x["election"])
    assert e1["phase"] == "upcoming" and e1["days_until"] == 4
    assert e2["phase"] == "ended" and e2["results_note"]


def test_bad_params():
    assert client.get("/api/house", params={"map": 5}).status_code == 422
    assert client.get("/api/senate", params={"as_of": "nope"}).status_code == 422


def test_search():
    r = get("/api/search", q="texas")
    assert any(x["type"] == "state" for x in r)
    assert get("/api/search", q="تكساس")


def test_meta_has_sources_and_dates():
    m = get("/api/meta")
    assert m["datasets"] and all(d["verified_at"] for d in m["datasets"])
    assert any(s["kind"] == "estimate" for s in m["sources"])
