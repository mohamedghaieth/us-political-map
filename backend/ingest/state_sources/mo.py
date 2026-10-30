"""Missouri Secretary of State - Certification of Candidates and Party Emblems, November 3, 2026 general election.

Complete ballot list for the eight U.S. House districts (Missouri has no Governor or U.S. Senate race in 2026).
Only candidate names are read; the booklet's addresses are never parsed or stored.
"""
from __future__ import annotations

import re
from pathlib import Path

import pdfplumber

from .base import StateCandidate, StateSource, download

URL = "https://www.sos.mo.gov/CMSImages/ElectionCandidates/2026GeneralElectionCertifiedCandidates.pdf"
SOURCE = StateSource(
    id="state_mo", state="MO",
    name_ar="وزير خارجية ميزوري - اعتماد المرشحين (انتخابات 3 نوفمبر 2026)",
    name_en="Missouri Secretary of State - Certification of Candidates (Nov 3, 2026)",
    url=URL, filename="mo_certified_candidates_2026_general.pdf", document_date="2026-08-25",
    covers=("house",),
    note="قائمة معتمدة بمرشحي الأحزاب الجمهوري والديمقراطي والليبرتاري والمستقلين لمقاعد النواب الثمانية.",
)

_PARTY_HDR = re.compile(r"^(REPUBLICAN|DEMOCRATIC|LIBERTARIAN|GREEN|CONSTITUTION|INDEPENDENT) CANDIDATES$")
_FOR = re.compile(r"^For (.+)$")
_ENTRY = re.compile(r"^District (\d+), (.+)$")
_LABEL = {"REPUBLICAN": "Republican", "DEMOCRATIC": "Democratic", "LIBERTARIAN": "Libertarian",
          "GREEN": "Green", "CONSTITUTION": "Constitution", "INDEPENDENT": "Independent"}


def fetch(raw_dir: Path, force: bool = False) -> Path:
    return download(URL, raw_dir / "states" / SOURCE.filename, force)


def parse(path: Path) -> list[StateCandidate]:
    out: list[StateCandidate] = []
    party = office = None
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for raw in (page.extract_text() or "").splitlines():
                line = raw.strip()
                m = _PARTY_HDR.match(line)
                if m:
                    party, office = _LABEL[m.group(1)], None
                    continue
                if line.endswith("JUDICIAL CANDIDATES") or "PARTY EMBLEM" in line:
                    office = None if "EMBLEM" not in line else office
                    if "JUDICIAL" in line:
                        party = None
                    continue
                m = _FOR.match(line)
                if m:
                    office = m.group(1)
                    continue
                m = _ENTRY.match(line)
                if m and party and office == "U.S. Representative":
                    out.append(StateCandidate("MO", "house", int(m.group(1)), m.group(2).strip(), party))
    return out
