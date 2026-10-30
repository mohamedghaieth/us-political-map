"""Download raw source files into data/raw (cached; use --force to refresh).

Sources
  * unitedstates/congress-legislators  - current members of Congress (official-derived)
  * FEC bulk download cn26.zip         - candidate master file, 2026 cycle (fec.gov)
  * Census TIGER/Line 2026 cd120       - 120th Congress districts (2026 election maps)
  * Census cartographic cd119          - 119th Congress districts (current members' maps)
  * Wikipedia (rendered HTML)          - governors, race summaries/candidates, forecaster ratings
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
UA = {"User-Agent": "usa-political-map/1.0 (educational data ingestion; contact: project owner)"}

WIKI_PAGES = {
    "governors_2026": "2026_United_States_gubernatorial_elections",
    "senate_2026": "2026_United_States_Senate_elections",
    "house_2026": "2026_United_States_House_of_Representatives_elections",
    "house_ratings": "2026_United_States_House_of_Representatives_election_ratings",
    "governors_current": "List_of_current_United_States_governors",
}

STATE_FIPS = [
    "01", "02", "04", "05", "06", "08", "09", "10", "11", "12", "13", "15", "16", "17", "18", "19", "20",
    "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37",
    "38", "39", "40", "41", "42", "44", "45", "46", "47", "48", "49", "50", "51", "53", "54", "55", "56",
]


def get(url: str, dest: Path, force: bool, binary: bool = True) -> Path:
    if dest.exists() and dest.stat().st_size > 0 and not force:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(4):
        try:
            r = requests.get(url, headers=UA, timeout=120, allow_redirects=True)
            r.raise_for_status()
            dest.write_bytes(r.content)
            print(f"  fetched {url} ({len(r.content):,} bytes)")
            return dest
        except Exception as exc:  # noqa: BLE001
            print(f"  retry {attempt + 1} {url}: {exc}", file=sys.stderr)
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"failed to download {url}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    f = args.force

    get("https://unitedstates.github.io/congress-legislators/legislators-current.json",
        RAW / "legislators-current.json", f)
    get("https://www.fec.gov/files/bulk-downloads/2026/cn26.zip", RAW / "fec" / "cn26.zip", f)
    get("https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_cd119_500k.zip",
        RAW / "tiger119" / "cb_2025_us_cd119_500k.zip", f)
    for fips in STATE_FIPS:
        get(f"https://www2.census.gov/geo/tiger/TIGER2026/CD/tl_2026_{fips}_cd120.zip",
            RAW / "tiger120" / f"tl_2026_{fips}_cd120.zip", f)

    from state_sources import ADAPTERS  # official state election-authority documents

    for mod in ADAPTERS:
        mod.fetch(RAW, f)

    meta = {}
    for key, title in WIKI_PAGES.items():
        dest = RAW / "wp" / f"{key}.html"
        if dest.exists() and not f:
            continue
        url = ("https://en.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2"
               f"&prop=text%7Crevid&redirects=1&page={title}")
        r = requests.get(url, headers=UA, timeout=120)
        r.raise_for_status()
        j = r.json()
        if "parse" not in j:
            print("  WARN missing page", title, j, file=sys.stderr)
            continue
        dest.write_text(j["parse"]["text"], encoding="utf-8")
        meta[key] = {"title": j["parse"]["title"], "revid": j["parse"]["revid"]}
        print(f"  wiki {key}: {j['parse']['title']} rev {j['parse']['revid']}")
    mp = RAW / "wp" / "meta.json"
    old = json.loads(mp.read_text()) if mp.exists() else {}
    old.update(meta)
    # revision timestamps (when each Wikipedia page was last edited) and upstream data freshness
    revids = [str(v["revid"]) for v in old.values()]
    try:
        r = requests.get("https://en.wikipedia.org/w/api.php", headers=UA, timeout=60, params={
            "action": "query", "format": "json", "formatversion": 2, "prop": "revisions",
            "rvprop": "timestamp", "revids": "|".join(revids)})
        for page in r.json()["query"]["pages"]:
            for rev in page.get("revisions", []):
                for v in old.values():
                    if page["title"] == v["title"]:
                        v["timestamp"] = rev["timestamp"]
    except Exception as exc:  # noqa: BLE001
        print("  WARN revision timestamps unavailable:", exc, file=sys.stderr)
    mp.write_text(json.dumps(old, indent=1))
    try:
        r = requests.get("https://api.github.com/repos/unitedstates/congress-legislators/commits",
                         params={"path": "legislators-current.yaml", "per_page": 1}, headers=UA, timeout=60)
        (RAW / "legislators-meta.json").write_text(json.dumps(
            {"last_commit": r.json()[0]["commit"]["committer"]["date"]}, indent=1))
    except Exception as exc:  # noqa: BLE001
        print("  WARN legislators commit date unavailable:", exc, file=sys.stderr)
    (RAW / "fetch-log.json").write_text(json.dumps(
        {"fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, indent=1))
    print("done")


if __name__ == "__main__":
    main()
