"""Turn the raw downloads into a normalized dataset (data/processed/dataset.json).

Every record carries: source id, verified_at (when we last fetched the source), valid_as_of
(source revision/commit date), data_type (official | announced | estimate) and completeness.
Nothing is invented: missing facts stay null and are reported in dataset["quality"].

Run:  python -m ingest.build_dataset      (from backend/)
"""
from __future__ import annotations

import io
import json
import re
import sys
import unicodedata
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import unquote

sys.path.insert(0, str(Path(__file__).resolve().parent))

import arabic  # noqa: E402
import reference as ref  # noqa: E402
from wikitables import cell_text, clean, load, table_grid  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed" / "dataset.json"
GEO = ROOT / "frontend" / "public" / "data"

GENERAL_DATE = "2026-11-03"

# ------------------------------------------------------------------ utilities


def norm_name(n: str) -> str:
    n = unicodedata.normalize("NFKD", n)
    n = "".join(c for c in n if not unicodedata.combining(c))
    n = re.sub(r"\(.*?\)", " ", n)
    n = re.sub(r"[\"“”'’.,]", " ", n.lower())
    n = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", " ", n)
    return " ".join(n.split())


def same_person(a: str, b: str) -> bool:
    ta, tb = norm_name(a).split(), norm_name(b).split()
    if not ta or not tb:
        return False
    # compare last names (a candidate may carry a double surname) and first-name prefix
    if ta[-1] != tb[-1] and not (ta[-1] in tb or tb[-1] in ta):
        return False
    return ta[0][:3] == tb[0][:3] or ta[0][0] == tb[0][0] and (len(ta[0]) <= 2 or len(tb[0]) <= 2)


def parse_us_date(s: str) -> str | None:
    s = clean(re.sub(r"\[.*?\]", "", s))
    m = re.search(r"([A-Z][a-z]+)\.? (\d{1,2}), (\d{4})", s)
    if not m:
        return None
    for fmt in ("%B %d %Y", "%b %d %Y"):
        try:
            return datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)}", fmt).date().isoformat()
        except ValueError:
            continue
    return None


def status_kind(text: str) -> str:
    t = text.lower()
    if "lost" in t and ("renomination" in t or "primary" in t) or "defeated" in t:
        return "lost_primary"
    if "retir" in t or "not seeking" in t or "resign" in t:
        return "retiring"
    if "term-limited" in t or "term limited" in t:
        return "term_limited"
    if "withdr" in t:
        return "withdrawn"
    if "ineligible" in t:
        return "ineligible"
    if any(k in t for k in ("renominated", "re-elected", "advanced", "nominated", "running", "unopposed",
                            "seeking reelection")):
        return "running"
    return "unknown"


def candidate_items(cell) -> list[dict]:
    out = []
    items = cell.find_all("li") or [cell]
    for li in items:
        for sup in li.find_all("sup"):
            sup.decompose()
        a = li.find("a", href=re.compile(r"^/wiki/"))
        title = None
        if a and "redlink" not in a.get("href", "") and not a.get("href", "").startswith("/wiki/File:"):
            title = unquote(a["href"][len("/wiki/"):]).split("#")[0]
        text = clean(li.get_text(" ").replace("▌", " "))
        # primary-results lists append the vote share and an advancing marker ("Y Name (Party) 62.1%")
        text = re.sub(r"\s+\d+(?:\.\d+)?%$", "", text)
        text = re.sub(r"^[YN]\s+(?=[A-Z])", "", text)
        if not text:
            continue
        m = re.match(r"^(.*?)\s*\(([^()]*)\)\s*(?:\([^()]*\))?\s*$", text)
        name, party_label = (clean(m.group(1)), clean(m.group(2))) if m else (text, "")
        if not name:
            continue
        out.append({"name": name, "party_label": party_label, "party": ref.party_code(party_label),
                    "wiki": title})
    return out


RATING_HDR = re.compile(
    r"^(?P<who>.+?)\s+(?P<mon>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(?P<d>\d{1,2}),?\s+(?P<y>\d{4})$")
FORECASTERS = {
    "Cook": ("Cook Political Report", "https://www.cookpolitical.com/ratings"),
    "IE": ("Inside Elections", "https://insideelections.com/ratings"),
    "Sabato": ("Sabato's Crystal Ball", "https://centerforpolitics.org/crystalball/"),
    "DDHQ": ("Decision Desk HQ", "https://decisiondeskhq.com/"),
    "Fox": ("Fox News Power Rankings", "https://www.foxnews.com/politics"),
    "NBC": ("NBC News", "https://www.nbcnews.com/politics/2026-elections"),
    "RCP": ("RealClearPolitics", "https://www.realclearpolling.com/"),
    "Econ": ("The Economist", "https://www.economist.com/interactive/us-midterms-2026"),
    "ST": ("Split Ticket", "https://split-ticket.org/"),
    "Silver": ("Silver Bulletin", "https://www.natesilver.net/"),
    "FPO": ("FPO (الاختصار كما ورد في المصدر)", None),
}


def rating_columns(header_row) -> list[tuple[int, str, str]]:
    cols = []
    for i, c in enumerate(header_row):
        m = RATING_HDR.match(cell_text(c))
        if m:
            who = m.group("who").rstrip(".")
            mon = {"Sept": "Sep"}.get(m.group("mon"), m.group("mon"))
            d = datetime.strptime(f"{mon} {m.group('d')} {m.group('y')}", "%b %d %Y").date().isoformat()
            cols.append((i, who, d))
    return cols


# ------------------------------------------------------------------ builder


class Builder:
    def __init__(self) -> None:
        self.fetched_at = json.loads((RAW / "fetch-log.json").read_text())["fetched_at"]
        self.wpmeta = json.loads((RAW / "wp" / "meta.json").read_text())
        self.legmeta = json.loads((RAW / "legislators-meta.json").read_text())
        self.ref_date = date.today().isoformat()
        self.persons: dict[str, dict] = {}
        self.offices: dict[str, dict] = {}
        self.holdings: list[dict] = []
        self.elections: dict[str, dict] = {}
        self.candidacies: list[dict] = []
        self.forecasts: list[dict] = []
        self.conflicts: list[dict] = []
        self.warnings: list[str] = []
        self.sources: dict[str, dict] = {}
        self._src_defs()

    # --- sources registry
    def _src_defs(self) -> None:
        S = self.sources

        def add(id_, name_ar, name_en, url, kind, valid_as_of, note=""):
            S[id_] = {"id": id_, "name_ar": name_ar, "name_en": name_en, "url": url, "kind": kind,
                      "verified_at": self.fetched_at, "valid_as_of": valid_as_of, "note": note}

        add("legislators", "قاعدة بيانات أعضاء الكونغرس الحاليين (مشروع unitedstates)",
            "unitedstates/congress-legislators", "https://github.com/unitedstates/congress-legislators",
            "official", self.legmeta["last_commit"],
            "بيانات مفتوحة مُجمَّعة من senate.gov وhouse.gov وbioguide.congress.gov؛ يحدّثها متطوعون وقد تتأخر أيامًا عن الحدث.")
        add("senate_gov", "مجلس الشيوخ الأمريكي", "U.S. Senate", "https://www.senate.gov/senators/", "official", None)
        add("house_gov", "مجلس النواب الأمريكي", "U.S. House of Representatives",
            "https://www.house.gov/representatives", "official", None)
        add("fec_candidates", "لجنة الانتخابات الفيدرالية - ملف المرشحين 2026", "FEC candidate master 2026",
            "https://www.fec.gov/data/browse-data/?tab=bulk-data", "official", None,
            "تُستخدم لربط المرشحين بمعرّفاتهم الرسمية لدى FEC فقط.")
        add("census_tiger", "مكتب الإحصاء الأمريكي - حدود الدوائر (الكونغرس 120)", "US Census TIGER/Line 2026 cd120",
            "https://www2.census.gov/geo/tiger/TIGER2026/CD/", "official", "2026-10-06",
            "حدود الدوائر المعتمدة لانتخابات 2026 (تُبسَّط هندسيًا للعرض).")
        add("census_cb119", "مكتب الإحصاء الأمريكي - حدود الدوائر (الكونغرس 119)", "US Census cartographic cd119",
            "https://www2.census.gov/geo/tiger/GENZ2025/shp/", "official", None,
            "حدود الدوائر التي يمثّلها الأعضاء الحاليون حتى 3 يناير 2027.")
        for key, label in (("governors_current", "قائمة حكام الولايات الحاليين"),
                           ("governors_2026", "انتخابات حكام الولايات 2026"),
                           ("senate_2026", "انتخابات مجلس الشيوخ 2026"),
                           ("house_2026", "انتخابات مجلس النواب 2026"),
                           ("house_ratings", "تصنيفات سباقات مجلس النواب 2026")):
            m = self.wpmeta[key]
            kind = "estimate" if "ratings" in key else "announced"
            add(f"wp_{key}", f"ويكيبيديا - {label}", f"Wikipedia: {m['title']}",
                "https://en.wikipedia.org/wiki/" + m["title"].replace(" ", "_") + f"?oldid={m['revid']}", kind,
                m.get("timestamp"),
                "مصدر ثانوي يجمّع المرشحين المعلنين (من هيئات الانتخابات الرسمية في الولايات) وتصنيفات جهات التوقع؛ "
                "كل تصنيف منسوب إلى الجهة التي أصدرته.")

    def person(self, pid: str, **kw) -> dict:
        p = self.persons.setdefault(pid, {"id": pid})
        p.update({k: v for k, v in kw.items() if v is not None})
        return p

    # --- current officeholders
    def load_legislators(self) -> None:
        data = json.loads((RAW / "legislators-current.json").read_text(encoding="utf-8"))
        self.sen_by: dict[tuple[str, int], dict] = {}
        self.rep_by_geoid: dict[str, dict] = {}
        titles = []
        for m in data:
            t = m["terms"][-1]
            pid = m["id"]["bioguide"]
            name = m["name"].get("official_full") or f"{m['name']['first']} {m['name']['last']}"
            wiki = m["id"].get("wikipedia")
            rec = {"id": pid, "name": name, "wiki": wiki, "term": t, "fec": m["id"].get("fec", []),
                   "party": ref.party_code(t.get("party"))}
            if wiki:
                titles.append(wiki)
            if t["type"] == "sen":
                self.sen_by[(t["state"], t["class"])] = rec
            else:
                st = t["state"]
                cd = "98" if st in ("DC", "PR", "GU", "VI", "AS", "MP") else f"{t['district']:02d}"
                self.rep_by_geoid[ref.FIPS_BY_ABBR[st] + cd] = rec
        self.ar = arabic.resolve(titles)
        self.n_sen = len(self.sen_by)
        self.n_rep = len(self.rep_by_geoid)

    def add_member_person(self, rec: dict, kind: str) -> None:
        t = rec["term"]
        self.person(rec["id"], name_en=rec["name"], name_ar=self.ar.get(rec["wiki"]) if rec["wiki"] else None,
                    bioguide=rec["id"], wikipedia=rec["wiki"], fec_ids=rec["fec"],
                    photo_url=f"https://unitedstates.github.io/images/congress/225x275/{rec['id']}.jpg",
                    website=t.get("url"))

    # --- states / parties
    def build_states(self) -> list[dict]:
        out = []
        for fips, ab, en, ar_, cen, car in ref.STATES:
            out.append({"fips": fips, "abbr": ab, "name_en": en, "name_ar": ar_, "capital_en": cen,
                        "capital_ar": car, "kind": "state"})
        for fips, ab, en, ar_, cen, car in ref.OTHER_JURISDICTIONS:
            out.append({"fips": fips, "abbr": ab, "name_en": en, "name_ar": ar_, "capital_en": cen,
                        "capital_ar": car, "kind": "federal_district" if ab == "DC" else "territory"})
        return out

    # --- Senate
    def build_senate(self) -> None:
        soup = load(str(RAW / "wp" / "senate_2026.html"))
        tables = soup.find_all("table")
        rating_t = reg_t = spec_t = date_t = None
        for t in tables:
            g = table_grid(t)
            if len(g) < 3:
                continue
            hdr = " ".join(cell_text(c) for c in g[1]) if len(g) > 1 else ""
            hdr0 = " ".join(cell_text(c) for c in g[0])
            if "Ratings" in hdr0 and "Senator" in hdr and rating_t is None:
                rating_t = g
            elif "Candidates" in hdr0 and "Results" in hdr0 and "Senator" in hdr:
                reg_t = g
            elif "Candidates" in hdr0 and "Status" in hdr0 and "Senator" in hdr and "Results" not in hdr0:
                spec_t = g
            elif "Filing deadline" in hdr0 and "General election" in hdr0:
                date_t = g
        assert rating_t and reg_t and spec_t and date_t, "Senate tables not found"

        dates = {}
        for r in date_t[1:]:
            st = cell_text(r[0])
            dates[st] = {"filing": parse_us_date(cell_text(r[1])), "primary": parse_us_date(cell_text(r[2])),
                         "runoff": parse_us_date(cell_text(r[3])), "general": parse_us_date(cell_text(r[4]))}

        # offices + holdings for all 100 seats
        for (ab, cls), rec in sorted(self.sen_by.items()):
            oid = f"SEN-{ab}-{cls}"
            self.offices[oid] = {"id": oid, "kind": "senate", "state": ab, "senate_class": cls, "district": None,
                                 "geoid": None, "map_version": None,
                                 "next_election_year": 2026 if cls == 2 else {1: 2030, 3: 2028}[cls]}
            self.add_member_person(rec, "sen")
            t = rec["term"]
            self.holdings.append({"office_id": oid, "person_id": rec["id"], "party": rec["party"],
                                  "term_start": t["start"], "term_end": t["end"], "status": "current",
                                  "source_id": "legislators", "data_type": "official",
                                  "completeness": "complete", "meta": {"caucus": ref.party_code(t["caucus"]) if t.get("caucus") else None}})

        def senate_row(race_name: str):
            m = re.match(r"^(.*?)\s*\((?:Class (\d)|special)\)$", race_name)
            if m:
                st = m.group(1)
                return st, (int(m.group(2)) if m.group(2) else None), True
            return race_name, 2, False

        cand_map = {}
        for tbl, special in ((reg_t, False), (spec_t, True)):
            hdr = [cell_text(c) for c in tbl[1]]
            ci = hdr.index("Candidates")
            si = hdr.index("Results") if "Results" in hdr else hdr.index("Status")
            for r in tbl[2:]:
                name = cell_text(r[0])
                if not name or name == "Overall":
                    continue
                st, cls, is_sp = senate_row(name)
                ab = ref.ABBR_BY_NAME[st]
                if cls is None:
                    cls = next(c for (a, c) in self.sen_by if a == ab and c != 2) if special else 2
                cand_map[(ab, cls)] = {"incumbent_name": cell_text(r[2]), "party": ref.party_code(cell_text(r[3])),
                                       "status_text": cell_text(r[si]), "cands": candidate_items(r[ci]),
                                       "special": special}
        rating_rows = {}
        cols = rating_columns(rating_t[1])
        for r in rating_t[2:]:
            name = cell_text(r[0])
            if name in ("Overall", ""):
                continue
            st, cls, is_sp = senate_row(name)
            if cls is None:  # "(special)": the class-3 seat of that state
                ab = ref.ABBR_BY_NAME[st]
                cls = next(c for (a, c) in cand_map if a == ab and cand_map[(a, c)]["special"])
            rating_rows[(ref.ABBR_BY_NAME[st], cls)] = {w: (cell_text(r[i]), d) for i, w, d in cols}

        for (ab, cls), c in sorted(cand_map.items()):
            oid = f"SEN-{ab}-{cls}"
            holder = self.sen_by.get((ab, cls))
            if holder and norm_name(holder["name"]).split()[-1] != norm_name(c["incumbent_name"]).split()[-1]:
                self.conflicts.append({"office_id": oid, "field": "holder", "official": holder["name"],
                                       "other": c["incumbent_name"], "other_source": "wp_senate_2026",
                                       "note": "اختلاف في هوية شاغل المقعد بين المصدرين؛ يُعتمد المصدر الرسمي."})
            st_name = next(s[2] for s in ref.STATES if s[1] == ab)
            d = dates.get(st_name, {})
            eid = f"E2026-{oid}"
            kind = "special" if c["special"] else "general"
            self.add_election(eid, oid, kind, d.get("general") or GENERAL_DATE, "wp_senate_2026",
                              status_text=c["status_text"], incumbents=[{
                                  "name": c["incumbent_name"], "party": c["party"],
                                  "person_id": holder["id"] if holder else None}],
                              primary=d.get("primary"), runoff=d.get("runoff"), filing=d.get("filing"),
                              holder_party=holder["party"] if holder else None)
            self.add_candidacies(eid, c["cands"], "wp_senate_2026", c["incumbent_name"])
            for who, (raw, pub) in rating_rows.get((ab, cls), {}).items():
                self.add_forecast(eid, who, raw, pub, "wp_senate_2026")

    # --- elections / candidates / forecasts helpers
    def add_election(self, eid, oid, kind, date_, source, status_text, incumbents, holder_party=None, **extra):
        sk = status_kind(status_text) if status_text else "unknown"
        no_incumbent = not incumbents or all(i.get("name") in (None, "", "None") for i in incumbents)
        self.elections[eid] = {
            "id": eid, "office_id": oid, "kind": kind, "cycle": 2026, "election_date": date_,
            "incumbent_status": "none" if no_incumbent else sk, "status_text": status_text,
            "incumbents": [] if no_incumbent else incumbents,
            "defending_party": holder_party, "source_id": source,
            "primary_date": extra.get("primary"), "runoff_date": extra.get("runoff"),
            "filing_deadline": extra.get("filing"),
        }

    def add_candidacies(self, eid, cands, source, incumbent_name) -> None:
        seen = set()
        for c in cands:
            key = norm_name(c["name"])
            if key in seen:
                continue
            seen.add(key)
            is_inc = bool(incumbent_name) and same_person(c["name"], incumbent_name)
            self.candidacies.append({
                "election_id": eid, "name_en": c["name"], "wiki": c["wiki"], "party": c["party"],
                "party_label": c["party_label"], "status": "declared", "stage": "general_ballot",
                "is_incumbent": is_inc, "source_id": source, "data_type": "announced",
                "fec_id": None})

    def add_forecast(self, eid, who, raw, published, source) -> None:
        parsed = ref.parse_rating(raw)
        if not parsed:
            return
        name, url = FORECASTERS.get(who, (who, None))
        self.forecasts.append({"election_id": eid, "forecaster": who, "forecaster_name": name,
                               "forecaster_url": url, "rating_label": raw, "rating_party": parsed["party"],
                               "rating_level": parsed["level"], "flip": parsed["flip"],
                               "published_on": published, "source_id": source, "data_type": "estimate"})

    # --- Governors
    def build_governors(self) -> None:
        soup = load(str(RAW / "wp" / "governors_current.html"))
        g = table_grid(soup.find_all("table")[1])
        hdr = [cell_text(c) for c in g[0]]
        ix = {h: i for i, h in enumerate(hdr)}
        gov_by = {}
        titles = []
        for r in g[1:]:
            st = clean(cell_text(r[0]).split("(")[0])
            ab = ref.ABBR_BY_NAME.get(st)
            if not ab:
                continue
            link = r[ix["Governor"]].find("a", href=re.compile(r"^/wiki/"))
            wiki = unquote(link["href"][6:]) if link else None
            img = r[ix["Image"]].find("img")
            photo = img["src"] if img else None
            if photo and photo.startswith("//"):
                photo = "https:" + photo
            if photo:
                photo = photo.split("?")[0]
            te = cell_text(r[ix["Term end"]])
            gov_by[ab] = {"name": cell_text(r[ix["Governor"]]), "wiki": wiki, "photo": photo,
                          "party": ref.party_code(cell_text(r[ix["Party"]]) or cell_text(r[ix["Party"] - 1])),
                          "start": parse_us_date(cell_text(r[ix["Term start"]])),
                          "end_year": int(re.match(r"(\d{4})", te).group(1)) if re.match(r"(\d{4})", te) else None,
                          "end_note": te}
            if wiki:
                titles.append(wiki)
        ar_names = arabic.resolve(titles)
        sites = arabic.official_websites(titles)

        gov26 = load(str(RAW / "wp" / "governors_2026.html"))
        rating_t = race_t = None
        for t in gov26.find_all("table"):
            gg = table_grid(t)
            if len(gg) < 5:
                continue
            h0 = " ".join(cell_text(c) for c in gg[0])
            if "Ratings" in h0:
                rating_t = gg
            elif "Candidates" in h0 and "Governor" in h0 and race_t is None:
                race_t = gg
        assert rating_t and race_t
        race = {}
        h = [cell_text(c) for c in race_t[0]]
        for r in race_t[1:]:
            ab = ref.ABBR_BY_NAME.get(cell_text(r[0]))
            if not ab:
                continue
            race[ab] = {"gov": cell_text(r[h.index("Governor")]), "status": cell_text(r[h.index("Status")]),
                        "cands": candidate_items(r[h.index("Candidates")])}
        rating_rows = {}
        cols = rating_columns(rating_t[1])
        for r in rating_t[2:]:
            ab = ref.ABBR_BY_NAME.get(cell_text(r[0]))
            if ab:
                rating_rows[ab] = {w: (cell_text(r[i]), d) for i, w, d in cols}

        if set(race) != {a for a, y in [(k, 2026) for k in race]} or len(race) != 36:
            self.warnings.append(f"expected 36 governor races in 2026, found {len(race)}")
        expected_other = set(ref.GOV_ELECTION_YEAR_OTHER)
        if set(gov_by) - set(race) != expected_other:
            self.warnings.append("governor election-year reference differs from ingested 2026 table: "
                                 f"{sorted(set(gov_by) - set(race) ^ expected_other)}")
        for ab, gv in sorted(gov_by.items()):
            oid = f"GOV-{ab}"
            nxt = 2026 if ab in race else ref.GOV_ELECTION_YEAR_OTHER.get(ab)
            self.offices[oid] = {"id": oid, "kind": "governor", "state": ab, "senate_class": None,
                                 "district": None, "geoid": None, "map_version": None,
                                 "next_election_year": nxt}
            pid = "GOV:" + ab
            self.person(pid, name_en=gv["name"], name_ar=ar_names.get(gv["wiki"]) if gv["wiki"] else None,
                        wikipedia=gv["wiki"], photo_url=gv["photo"],
                        website=sites.get(gv["wiki"]) if gv["wiki"] else None)
            self.holdings.append({"office_id": oid, "person_id": pid, "party": gv["party"],
                                  "term_start": gv["start"], "term_end": None, "status": "current",
                                  "source_id": "wp_governors_current", "data_type": "announced",
                                  "completeness": "partial",
                                  "meta": {"term_end_year": gv["end_year"], "term_end_text": gv["end_note"],
                                           "start_note": "تاريخ تولي المنصب (بدء الخدمة المتواصلة) وليس بالضرورة بداية الفترة الحالية"}})
            if ab in race:
                rc = race[ab]
                eid = f"E2026-{oid}"
                self.add_election(eid, oid, "general", GENERAL_DATE, "wp_governors_2026",
                                  status_text=rc["status"], incumbents=[{"name": gv["name"], "party": gv["party"],
                                                                         "person_id": pid}],
                                  holder_party=gv["party"])
                self.add_candidacies(eid, rc["cands"], "wp_governors_2026", gv["name"])
                for who, (raw, pub) in rating_rows.get(ab, {}).items():
                    self.add_forecast(eid, who, raw, pub, "wp_governors_2026")

    # --- House
    def geoids(self, name: str) -> list[dict]:
        j = json.loads((GEO / name).read_text(encoding="utf-8"))
        return [g["properties"] for g in j["objects"]["districts"]["geometries"]]

    def build_house(self) -> None:
        # 119th: current members on current maps
        props119 = {p["GEOID"]: p for p in self.geoids("districts119.topo.json")}
        for geoid, p in sorted(props119.items()):
            ab = ref.ABBR_BY_FIPS[geoid[:2]]
            oid = f"H119-{geoid}"
            self.offices[oid] = {"id": oid, "kind": "house", "state": ab, "senate_class": None,
                                 "district": int(geoid[2:]), "geoid": geoid, "map_version": 119,
                                 "next_election_year": 2026}
            rec = self.rep_by_geoid.get(geoid)
            if rec:
                self.add_member_person(rec, "rep")
                t = rec["term"]
                self.holdings.append({"office_id": oid, "person_id": rec["id"], "party": rec["party"],
                                      "term_start": t["start"], "term_end": t["end"], "status": "current",
                                      "source_id": "legislators", "data_type": "official",
                                      "completeness": "complete",
                                      "meta": {"caucus": ref.party_code(t["caucus"]) if t.get("caucus") else None}})
            else:
                self.holdings.append({"office_id": oid, "person_id": None, "party": None, "term_start": None,
                                      "term_end": None, "status": "vacant", "source_id": "legislators",
                                      "data_type": "official", "completeness": "complete",
                                      "meta": {"note": "مقعد شاغل في قاعدة البيانات الرسمية الحالية"}})
        extra = set(self.rep_by_geoid) - set(props119)
        if extra:
            self.warnings.append(f"members without a 119th-district geometry: {sorted(extra)}")

        # 120th: 2026 election map, taken from Wikipedia state sections
        props120 = {p["GEOID"] for p in self.geoids("districts120.topo.json")}
        soup = load(str(RAW / "wp" / "house_2026.html"))
        rows: dict[str, dict] = {}
        for t in soup.find_all("table"):
            g = table_grid(t)
            if len(g) < 3:
                continue
            hdr0 = [cell_text(c) for c in g[0]]
            hdr1 = [cell_text(c) for c in g[1]]
            names = [(hdr1[i] if hdr1[i] and hdr1[i] != hdr0[i] else hdr0[i]) for i in range(len(hdr0))]
            if "District" not in hdr0 or "Candidates" not in names:
                continue
            def col(*keys):
                for i, n in enumerate(names):
                    if any(n.startswith(k) for k in keys):
                        return i
                return None
            c_loc, c_mem, c_party = 0, col("Member", "Delegate"), col("Party")
            c_stat, c_cand = col("Status", "Results"), col("Candidates")
            c_pvi = col("2026 PVI", "PVI")
            for r in g[2:]:
                loc = cell_text(r[c_loc])
                m = re.match(r"^(.*?) (\d+|at-large)$", loc)
                if not m:
                    continue
                st = m.group(1)
                ab = ref.ABBR_BY_NAME.get(st)
                if not ab:
                    continue
                cd = "98" if ab in ("DC", "PR", "GU", "VI", "AS", "MP") or m.group(2) == "at-large" and ab == "DC" \
                    else ("00" if m.group(2) == "at-large" else f"{int(m.group(2)):02d}")
                geoid = ref.FIPS_BY_ABBR[ab] + cd
                d = rows.setdefault(geoid, {"incumbents": [], "status": [], "cands": None, "pvi": None})
                mem_text = cell_text(r[c_mem]) if c_mem is not None else ""
                if mem_text and not mem_text.startswith("None") and not mem_text.startswith("Vacant"):
                    note = None
                    mm = re.search(r"(Redistricted from|Moved from|Running in)(.*)$", mem_text)
                    nm = mem_text[:mm.start()].strip() if mm else mem_text
                    if mm:
                        note = clean(mm.group(0))
                    nm = re.sub(r"\s*\(.*?\)$", "", nm)
                    party = ref.party_code(cell_text(r[c_party])) if c_party is not None else "U"
                    if not any(i["name"] == nm for i in d["incumbents"]):
                        d["incumbents"].append({"name": nm, "party": party, "note": note})
                if c_stat is not None:
                    s = cell_text(r[c_stat])
                    if s and s not in d["status"]:
                        d["status"].append(s)
                if d["cands"] is None and c_cand is not None:
                    d["cands"] = candidate_items(r[c_cand])
                if c_pvi is not None and d["pvi"] is None:
                    d["pvi"] = cell_text(r[c_pvi])
        wiki_geoids = set(rows)
        missing = props120 - wiki_geoids
        extra_w = wiki_geoids - props120 - {g for g in wiki_geoids if g[:2] in ("72", "66", "78", "60", "69")}
        if missing or extra_w:
            self.warnings.append(f"120th map vs Wikipedia tables mismatch: missing={sorted(missing)} extra={sorted(extra_w)}")

        # match Wikipedia incumbents to bioguide people
        by_state_last = {}
        for geoid, rec in self.rep_by_geoid.items():
            by_state_last.setdefault((ref.ABBR_BY_FIPS[geoid[:2]]), []).append(rec)

        def match_member(name: str, ab: str):
            for rec in by_state_last.get(ab, []):
                if same_person(rec["name"], name):
                    return rec
            return None

        rating_rows = self.house_ratings()
        for geoid in sorted(wiki_geoids):
            ab = ref.ABBR_BY_FIPS[geoid[:2]]
            d = rows[geoid]
            oid = f"H120-{geoid}"
            self.offices[oid] = {"id": oid, "kind": "house", "state": ab, "senate_class": None,
                                 "district": int(geoid[2:]), "geoid": geoid, "map_version": 120,
                                 "next_election_year": 2026}
            incs = []
            for i in d["incumbents"]:
                rec = match_member(i["name"], ab)
                incs.append({"name": i["name"], "party": i["party"], "note": i["note"],
                             "person_id": rec["id"] if rec else None})
            status = " | ".join(d["status"])
            kinds = {status_kind(s) for s in d["status"]}
            defending = incs[0]["party"] if len(incs) == 1 else None
            eid = f"E2026-{oid}"
            self.add_election(eid, oid, "general", GENERAL_DATE, "wp_house_2026", status_text=status,
                              incumbents=incs, holder_party=defending)
            el = self.elections[eid]
            el["pvi"] = d["pvi"]
            if len(incs) > 1:
                el["incumbent_status"] = "multiple"
            elif incs and "running" in kinds and len(kinds) > 1:
                el["incumbent_status"] = "running"
            self.add_candidacies(eid, d["cands"] or [], "wp_house_2026", incs[0]["name"] if incs else None)
            if len(incs) > 1:
                for c in self.candidacies:
                    if c["election_id"] == eid:
                        c["is_incumbent"] = any(same_person(c["name_en"], i["name"]) for i in incs)
            for who, (raw, pub) in rating_rows.get(geoid, {}).items():
                self.add_forecast(eid, who, raw, pub, "wp_house_ratings")

    def house_ratings(self) -> dict[str, dict]:
        soup = load(str(RAW / "wp" / "house_ratings.html"))
        out = {}
        for t in soup.find_all("table"):
            g = table_grid(t)
            if len(g) < 20 or "Ratings" not in " ".join(cell_text(c) for c in g[0]):
                continue
            cols = rating_columns(g[1])
            for r in g[2:]:
                loc = cell_text(r[0])
                m = re.match(r"^(.*?) (\d+|at-large)$", loc)
                if not m or m.group(1) not in ref.ABBR_BY_NAME:
                    continue
                ab = ref.ABBR_BY_NAME[m.group(1)]
                cd = "00" if m.group(2) == "at-large" else f"{int(m.group(2)):02d}"
                out[ref.FIPS_BY_ABBR[ab] + cd] = {w: (cell_text(r[i]), d) for i, w, d in cols}
        return out

    # --- FEC link-up
    def link_fec(self) -> dict:
        z = zipfile.ZipFile(RAW / "fec" / "cn26.zip")
        text = z.read(z.namelist()[0]).decode("latin-1")
        recs = []
        for line in text.splitlines():
            f = line.split("|")
            if len(f) < 9:
                continue
            recs.append({"id": f[0], "name": f[1], "pty": f[2], "yr": f[3], "st": f[4], "off": f[5],
                         "dist": f[6], "ici": f[7], "status": f[8]})
        idx: dict[tuple, list] = {}
        for r in recs:
            idx.setdefault((r["st"], r["off"], r["dist"]), []).append(r)

        def fec_name(n: str) -> str:
            last, _, first = n.partition(",")
            return f"{first.strip()} {last.strip()}"

        matched = 0
        total = 0
        for c in self.candidacies:
            el = self.elections[c["election_id"]]
            off = self.offices[el["office_id"]]
            if off["kind"] == "governor":
                continue
            total += 1
            if off["kind"] == "senate":
                key = (off["state"], "S", "00")
            else:
                key = (off["state"], "H", f"{off['district']:02d}" if off["district"] != 98 else "00")
            for r in idx.get(key, []):
                if same_person(c["name_en"], fec_name(r["name"])):
                    c["fec_id"] = r["id"]
                    matched += 1
                    break
        return {"fec_records": len(recs), "candidacies_checked": total, "matched": matched}

    # --- official state election-authority lists (override the secondary source where they exist)
    def apply_state_sources(self) -> None:
        from state_sources import ADAPTERS

        self.state_coverage: list[dict] = []
        self.discrepancies: list[dict] = []
        for mod in ADAPTERS:
            src = mod.SOURCE
            path = RAW / "states" / src.filename
            if not path.exists():
                self.warnings.append(f"official state source {src.id} not fetched; Wikipedia list used for {src.state}")
                continue
            cands = mod.parse(path)
            self.sources[src.id] = {
                "id": src.id, "name_ar": src.name_ar, "name_en": src.name_en, "url": src.url, "kind": "official",
                "verified_at": self.fetched_at, "valid_as_of": src.document_date, "note": src.note}
            by_el: dict[str, list] = {}
            for c in cands:
                fips = ref.FIPS_BY_ABBR[c.state]
                if c.office == "governor":
                    eid = f"E2026-GOV-{c.state}"
                elif c.office == "house":
                    eid = f"E2026-H120-{fips}{c.district:02d}"
                else:
                    eid = f"E2026-SEN-{c.state}-2"
                if eid not in self.elections:
                    self.warnings.append(f"{src.id}: no election {eid} for official candidate {c.name}")
                    continue
                by_el.setdefault(eid, []).append(c)
            st = {"source_id": src.id, "state": src.state, "document_date": src.document_date,
                  "offices": list(src.covers), "official_candidates": 0, "matched": 0, "only_official": 0,
                  "only_secondary": 0, "party_conflicts": 0, "elections_covered": len(by_el)}
            # every election of a covered office must appear in the official list
            for eid, el in self.elections.items():
                off = self.offices[el["office_id"]]
                if off["state"] == src.state and off["kind"] in src.covers and off["map_version"] in (None, 120)                         and eid not in by_el and off["kind"] != "senate":
                    self.discrepancies.append({"election_id": eid, "kind": "no_official_entry", "source_id": src.id,
                                               "name": None, "note": "السباق غير موجود في القائمة الرسمية المعتمدة"})
            for eid, lst in by_el.items():
                existing = [x for x in self.candidacies if x["election_id"] == eid]
                used: set[int] = set()
                for sc in lst:
                    st["official_candidates"] += 1
                    code = ref.party_code(sc.party_label)
                    hit = next((x for x in existing if id(x) not in used and same_person(x["name_en"], sc.name)), None)
                    if hit:
                        used.add(id(hit))
                        st["matched"] += 1
                        if hit["party"] != code:
                            st["party_conflicts"] += 1
                            self.discrepancies.append({"election_id": eid, "kind": "party_differs", "source_id": src.id,
                                                       "name": hit["name_en"], "official": sc.party_label,
                                                       "secondary": hit["party_label"],
                                                       "note": "اختلاف في الحزب؛ يُعتمد المصدر الرسمي"})
                        hit.update(source_id=src.id, data_type="official", party=code, party_label=sc.party_label)
                        hit["is_incumbent"] = hit["is_incumbent"] or sc.incumbent
                    else:
                        st["only_official"] += 1
                        self.discrepancies.append({"election_id": eid, "kind": "only_in_official", "source_id": src.id,
                                                   "name": sc.name, "official": sc.party_label,
                                                   "note": "مرشح في القائمة الرسمية غير وارد في المصدر الثانوي؛ أُضيف"})
                        self.candidacies.append({
                            "election_id": eid, "name_en": sc.name, "wiki": None, "party": code,
                            "party_label": sc.party_label, "status": "declared", "stage": "general_ballot",
                            "is_incumbent": sc.incumbent, "source_id": src.id, "data_type": "official", "fec_id": None})
                for x in existing:
                    if id(x) not in used:
                        st["only_secondary"] += 1
                        # the certified list is the ballot: a name missing from it is not a general-election candidate
                        x["status"] = "not_listed"
                        self.discrepancies.append({"election_id": eid, "kind": "only_in_secondary", "source_id": src.id,
                                                   "name": x["name_en"], "secondary": x["party_label"],
                                                   "note": "مرشح وارد في المصدر الثانوي وغير مدرج في القائمة الرسمية المعتمدة (غالبًا خسر التمهيدي)؛ لم يعد يُعرض مرشحًا رسميًا"})
            self.state_coverage.append(st)

    # --- Arabic names for candidates (only those with an Arabic Wikipedia article)
    def candidate_arabic(self) -> None:
        titles = sorted({c["wiki"] for c in self.candidacies if c["wiki"]})
        ar = arabic.resolve(titles)
        for c in self.candidacies:
            c["name_ar"] = ar.get(c["wiki"]) if c["wiki"] else None

    # --- assemble
    def run(self) -> dict:
        self.load_legislators()
        self.build_senate()
        self.build_governors()
        self.build_house()
        self.apply_state_sources()
        self.candidate_arabic()
        fec = self.link_fec()
        states = self.build_states()

        # per-election derived flags
        for el in self.elections.values():
            n = sum(1 for c in self.candidacies if c["election_id"] == el["id"])
            el["candidate_count"] = n
            el["is_open"] = el["incumbent_status"] in ("retiring", "term_limited", "lost_primary", "withdrawn", "ineligible", "none")
            el["candidates_undetermined"] = n == 0 or "runoff" in (el["status_text"] or "").lower()
            el["uncontested"] = n == 1

        datasets = [
            {"name": "officeholders", "label": "شاغلو المناصب الحاليون",
             "updated_at": self.legmeta["last_commit"], "verified_at": self.fetched_at, "status": "ok",
             "row_count": len(self.holdings), "source_ids": ["legislators", "wp_governors_current"]},
            {"name": "candidates", "label": "المرشحون المعلنون (قوائم الاقتراع العام)",
             "updated_at": max(self.wpmeta[k]["timestamp"] for k in ("governors_2026", "senate_2026", "house_2026")),
             "verified_at": self.fetched_at, "status": "ok", "row_count": len(self.candidacies),
             "source_ids": ["wp_governors_2026", "wp_senate_2026", "wp_house_2026", "fec_candidates"]
             + [c["source_id"] for c in self.state_coverage]},
            {"name": "forecasts", "label": "تصنيفات جهات التوقع",
             "updated_at": max(f["published_on"] for f in self.forecasts), "verified_at": self.fetched_at,
             "status": "ok", "row_count": len(self.forecasts),
             "source_ids": ["wp_senate_2026", "wp_governors_2026", "wp_house_ratings"]},
            {"name": "boundaries", "label": "حدود الدوائر الانتخابية", "updated_at": "2026-10-06",
             "verified_at": self.fetched_at, "status": "ok", "row_count": len(self.geoids("districts120.topo.json")),
             "source_ids": ["census_tiger", "census_cb119"]},
        ]
        quality = {"warnings": self.warnings, "conflicts": self.conflicts, "fec_link": fec,
                   "state_sources": self.state_coverage, "candidate_discrepancies": self.discrepancies,
                   "counts": {"senators": self.n_sen, "house_members_119": self.n_rep,
                              "persons": len(self.persons), "offices": len(self.offices),
                              "elections": len(self.elections), "candidacies": len(self.candidacies),
                              "forecasts": len(self.forecasts)}}
        return {
            "meta": {"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                     "fetched_at": self.fetched_at, "constants": {
                         "vice_president_party": ref.VICE_PRESIDENT_PARTY, "senate_majority": ref.SENATE_MAJORITY,
                         "house_majority": ref.HOUSE_MAJORITY, "general_election_date": GENERAL_DATE}},
            "parties": [dict(zip(("code", "name_en", "name_ar", "group", "color"), p)) for p in ref.PARTIES],
            "states": states, "sources": list(self.sources.values()), "datasets": datasets,
            "persons": list(self.persons.values()), "offices": list(self.offices.values()),
            "holdings": self.holdings, "elections": list(self.elections.values()),
            "candidacies": self.candidacies, "forecasts": self.forecasts, "quality": quality,
        }


def main() -> None:
    ds = Builder().run()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(ds, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(ds["quality"], ensure_ascii=False, indent=1)[:3000])
    print("written", OUT, OUT.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
