"""California Secretary of State - Official Certified List of Candidates, November 3, 2026 general election.

Complete ballot list (nominees of the June 2 primary), covering Governor and all 52 U.S. House districts
(California has no U.S. Senate race in 2026). Parsed from the certified PDF (dated 2026-08-27).
"""
from __future__ import annotations

import re
from pathlib import Path

import pdfplumber

from .base import StateCandidate, StateSource, download

URL = "https://elections.cdn.sos.ca.gov/statewide-elections/2026-general/cert-list-candidates.pdf"
SOURCE = StateSource(
    id="state_ca", state="CA",
    name_ar="وزير خارجية كاليفورنيا - القائمة المعتمدة للمرشحين (انتخابات 3 نوفمبر 2026)",
    name_en="California Secretary of State - Official Certified List of Candidates (Nov 3, 2026)",
    url=URL, filename="ca_certified_candidates_2026_general.pdf", document_date="2026-08-27",
    covers=("governor", "house"),
    note="قائمة معتمدة رسميًا للمرشحين المؤهلين لبطاقة الاقتراع العامة؛ تُستخرج آليًا من ملف PDF.",
)

PARTIES = ["Democratic", "Republican", "Libertarian", "Green", "Peace and Freedom", "American Independent",
           "Non-Partisan", "No Party Preference"]
_CAND = re.compile(r"^(?P<name>.+?)(?P<inc>\*)?\s+(?P<party>" + "|".join(PARTIES) + r")$")
_HOUSE = re.compile(r"^United States Representative District (\d+)$")
_SKIP = re.compile(r"^(General Election - |Official Certified List|\d{1,2}/\d{1,2}/\d{4}$|Page \d+ of \d+|\*\s*Incumbent)")


def fetch(raw_dir: Path, force: bool = False) -> Path:
    return download(URL, raw_dir / "states" / SOURCE.filename, force)


def parse(path: Path) -> list[StateCandidate]:
    out: list[StateCandidate] = []
    office: tuple[str, int | None] | None = None
    expect_desc = False
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages[1:]:  # page 0 is the certification letter
            for raw in (page.extract_text() or "").splitlines():
                line = raw.strip()
                if not line or _SKIP.match(line):
                    continue
                if line == "Governor":
                    office, expect_desc = ("governor", None), False
                    continue
                m = _HOUSE.match(line)
                if m:
                    office, expect_desc = ("house", int(m.group(1))), False
                    continue
                # any other all-caps/title heading (Lieutenant Governor, Controller, ...) ends the current block
                if office and not expect_desc:
                    c = _CAND.match(line)
                    if c:
                        out.append(StateCandidate("CA", office[0], office[1], c.group("name").strip(),
                                                  c.group("party"), incumbent=bool(c.group("inc"))))
                        expect_desc = True
                        continue
                    office = None  # a different office heading (or unparseable line) -> leave the block
                    continue
                expect_desc = False  # the line after a candidate is its ballot designation/occupation
    return out
