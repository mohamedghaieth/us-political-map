"""Resolve Arabic names for people from Wikipedia interlanguage links (cached on disk).

Only names that exist in the Arabic Wikipedia are returned; nothing is transliterated or
invented. Callers keep the English name as the canonical value.
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "raw" / "ar_names_cache.json"
UA = {"User-Agent": "usa-political-map/1.0 (educational data ingestion)"}
API = "https://en.wikipedia.org/w/api.php"


def _load() -> dict[str, str | None]:
    return json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}


def _clean_ar(title: str) -> str:
    return re.sub(r"\s*\([^)]*\)\s*$", "", title).strip()


def resolve(titles: list[str]) -> dict[str, str | None]:
    """titles: English Wikipedia titles (spaces or underscores). Returns title -> Arabic name or None."""
    cache = _load()
    norm = {t: t.replace("_", " ") for t in titles if t}
    todo = sorted({v for v in norm.values() if v not in cache})
    for i in range(0, len(todo), 50):
        batch = todo[i:i + 50]
        for attempt in range(3):
            try:
                r = requests.get(API, params={
                    "action": "query", "format": "json", "formatversion": 2, "prop": "langlinks",
                    "lllang": "ar", "lllimit": "max", "redirects": 1, "titles": "|".join(batch)},
                    headers=UA, timeout=60)
                r.raise_for_status()
                break
            except Exception:  # noqa: BLE001
                time.sleep(2)
        else:
            continue
        q = r.json().get("query", {})
        redirect_to = {x["from"]: x["to"] for x in q.get("redirects", []) + q.get("normalized", [])}
        ar_by_title = {}
        for p in q.get("pages", []):
            ll = p.get("langlinks")
            ar_by_title[p["title"]] = _clean_ar(ll[0]["title"]) if ll else None
        for t in batch:
            tgt = t
            for _ in range(3):  # follow normalization + redirect chain
                tgt = redirect_to.get(tgt, tgt)
            cache[t] = ar_by_title.get(tgt)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0), encoding="utf-8")
    return {t: cache.get(v) for t, v in norm.items()}


WD_CACHE = ROOT / "data" / "raw" / "official_sites_cache.json"


def official_websites(titles: list[str]) -> dict[str, str | None]:
    """English Wikipedia title -> official website (Wikidata P856), cached."""
    cache = json.loads(WD_CACHE.read_text(encoding="utf-8")) if WD_CACHE.exists() else {}
    todo = sorted({t.replace("_", " ") for t in titles if t} - set(cache))
    for i in range(0, len(todo), 40):
        batch = todo[i:i + 40]
        try:
            r = requests.get(API, params={
                "action": "query", "format": "json", "formatversion": 2, "prop": "pageprops",
                "ppprop": "wikibase_item", "redirects": 1, "titles": "|".join(batch)}, headers=UA, timeout=60)
            q = r.json()["query"]
            redirect_to = {x["from"]: x["to"] for x in q.get("redirects", []) + q.get("normalized", [])}
            qid_by_title = {p["title"]: p.get("pageprops", {}).get("wikibase_item") for p in q["pages"]}
            qids = [v for v in qid_by_title.values() if v]
            r2 = requests.get("https://www.wikidata.org/w/api.php", params={
                "action": "wbgetentities", "format": "json", "ids": "|".join(qids), "props": "claims"},
                headers=UA, timeout=60)
            ents = r2.json().get("entities", {})
            for t in batch:
                tgt = t
                for _ in range(3):
                    tgt = redirect_to.get(tgt, tgt)
                qid = qid_by_title.get(tgt)
                url = None
                if qid:
                    for c in ents.get(qid, {}).get("claims", {}).get("P856", []):
                        v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
                        if v and c.get("rank") != "deprecated":
                            url = v
                            break
                cache[t] = url
        except Exception:  # noqa: BLE001
            continue
    WD_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0), encoding="utf-8")
    return {t: cache.get(t.replace("_", " ")) for t in titles if t}
