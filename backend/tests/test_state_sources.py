"""Official state-source adapters: parsing, download integrity and reconciliation results."""
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "ingest"))

from state_sources import base, ca  # noqa: E402

RAW = BACKEND.parent / "data" / "raw"
CA_PDF = RAW / "states" / ca.SOURCE.filename


@pytest.mark.skipif(not CA_PDF.exists(), reason="California PDF not fetched")
def test_california_parse_covers_governor_and_52_districts():
    cands = ca.parse(CA_PDF)
    assert {c.name for c in cands if c.office == "governor"} == {"Xavier Becerra", "Steve Hilton"}
    houses = {}
    for c in cands:
        if c.office == "house":
            houses.setdefault(c.district, []).append(c)
    assert sorted(houses) == list(range(1, 53))
    # top-two primary: every district has exactly two general-election candidates
    assert all(len(v) == 2 for v in houses.values())
    assert all(c.party_label for c in cands)


def test_truncated_download_is_rejected(monkeypatch, tmp_path):
    class R:
        status_code = 200
        headers = {"Content-Length": "5000"}
        content = b"x" * 2000

        def raise_for_status(self):
            pass

    monkeypatch.setattr(base.requests, "get", lambda *a, **k: R())
    monkeypatch.setattr(base.time, "sleep", lambda s: None)
    with pytest.raises(RuntimeError, match="truncated"):
        base.download("http://example.test/x.pdf", tmp_path / "x.pdf", force=True)
    assert not (tmp_path / "x.pdf").exists()  # no partial file is left behind as if it were valid


def test_reconciliation_marks_official_candidates_in_api():
    from fastapi.testclient import TestClient

    from app.main import app

    c = TestClient(app)
    gov = next(x for x in c.get("/api/governors").json() if x["state"]["abbr"] == "CA")
    e = gov["election"]
    assert {x["name_en"] for x in e["candidates"]} >= {"Xavier Becerra", "Steve Hilton"}
    assert all(x["data_type"] == "official" for x in e["candidates"])
    assert any(s["id"] == "state_ca" and s["kind"] == "official" for s in e["candidate_sources"])
    # a state without an adapter keeps the secondary source and is not labelled official
    tx = next(x for x in c.get("/api/governors").json() if x["state"]["abbr"] == "TX")
    assert all(x["data_type"] != "official" for x in tx["election"]["candidates"])
    # candidates dropped by the official list (lost the primary) are not shown as current candidates
    ca1 = next(x for x in c.get("/api/house?map=120").json() if x["geoid"] == "0601")["election"]
    assert len(ca1["candidates"]) == 2
    assert {d["name_en"] for d in ca1["dropped_candidates"]} >= {"Audrey Denney"}


MO_PDF = RAW / "states" / "mo_certified_candidates_2026_general.pdf"


@pytest.mark.skipif(not MO_PDF.exists(), reason="Missouri PDF not fetched")
def test_missouri_parse_three_candidates_per_district_and_no_addresses():
    from state_sources import mo

    cands = mo.parse(MO_PDF)
    by = {}
    for c in cands:
        by.setdefault(c.district, []).append(c)
    assert sorted(by) == list(range(1, 9))
    assert all({x.party_label for x in v} == {"Democratic", "Republican", "Libertarian"} for v in by.values())
    # only names are kept: no street addresses leak into candidate names
    assert not any(any(ch.isdigit() for ch in c.name.replace("III", "")) for c in cands)


def test_missouri_marked_official_in_api():
    from fastapi.testclient import TestClient

    from app.main import app

    row = next(x for x in TestClient(app).get("/api/house?map=120").json() if x["geoid"] == "2905")["election"]
    assert {c["name_en"] for c in row["candidates"]} >= {"Emanuel Cleaver", "Rick Brattin"}
    assert all(c["data_type"] == "official" for c in row["candidates"])
