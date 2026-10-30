"""Framework for official state election-authority candidate lists.

An adapter downloads one official document (CSV/PDF/HTML) and parses it into
StateCandidate rows. build_dataset.apply_state_sources() reconciles them with the
secondary (Wikipedia) candidate lists: official names win, differences are reported
(never silently dropped) in dataset["quality"]["candidate_discrepancies"].
"""
from __future__ import annotations

import sys
import time
from dataclasses import dataclass
from pathlib import Path

import requests

UA = {"User-Agent": "Mozilla/5.0 (compatible; usa-political-map/1.0; educational data ingestion)"}


@dataclass
class StateCandidate:
    state: str  # postal abbreviation
    office: str  # governor | senate | house
    district: int | None  # house district number (0 = at-large); None otherwise
    name: str
    party_label: str
    incumbent: bool = False


@dataclass
class StateSource:
    id: str  # registry id, e.g. "state_ca"
    state: str
    name_ar: str
    name_en: str
    url: str  # human-facing document URL
    filename: str
    document_date: str  # date printed on the official document (ISO)
    covers: tuple[str, ...]  # offices fully covered: ("governor", "house") ...
    note: str = ""


def download(url: str, dest: Path, force: bool = False) -> Path:
    """Download with integrity check (Content-Length must match) and retries.

    A truncated download is rejected: it would otherwise parse as a plausible but incomplete list."""
    if dest.exists() and dest.stat().st_size > 1000 and not force:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    last: Exception | None = None
    for attempt in range(4):
        try:
            r = requests.get(url, headers=UA, timeout=180)
            r.raise_for_status()
            expected = r.headers.get("Content-Length")
            if expected and int(expected) != len(r.content) and not r.headers.get("Content-Encoding"):
                raise IOError(f"truncated download: {len(r.content)} of {expected} bytes")
            if len(r.content) < 1000:
                raise IOError("suspiciously small response")
            tmp = dest.with_suffix(dest.suffix + ".part")
            tmp.write_bytes(r.content)
            tmp.replace(dest)
            print(f"  fetched {url} ({len(r.content):,} bytes)")
            return dest
        except Exception as exc:  # noqa: BLE001
            last = exc
            print(f"  retry {attempt + 1} {url}: {exc}", file=sys.stderr)
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"failed to download {url}: {last}")
