"""Builds API payloads from an in-memory snapshot of the database (cached, refreshed on a TTL)."""
from __future__ import annotations

import threading
import time
from collections import defaultdict
from datetime import date, datetime, timezone

from sqlalchemy import select

from . import config
from . import models as m
from .db import SessionLocal

# Third-party forecasts are qualitative categories. This text is attached to every forecast payload.
FORECAST_NOTE = (
    "تصنيفات نوعية (آمن/مرجّح/يميل/متقارب) صادرة عن جهات خارجية وليست نتائج رسمية ولا احتمالات رقمية. "
    "المنهجية التفصيلية منشورة لدى كل جهة (الرابط في بطاقتها)، وتحمل التقديرات هامش عدم يقين لا يظهر في التصنيف. "
    "لم يُحوَّل أي تصنيف إلى نسبة مئوية."
)
RATING_LEVEL_AR = {4: "آمن/صلب", 3: "مرجّح", 2: "يميل", 1: "يميل قليلًا", 0: "متقارب (Toss-up)"}

SENATE_SEATS = 100


def today() -> date:
    return date.fromisoformat(config.REFERENCE_DATE) if config.REFERENCE_DATE else date.today()


class Snapshot:
    def __init__(self) -> None:
        with SessionLocal() as s:
            self.states = {x.abbr: x for x in s.scalars(select(m.State))}
            self.parties = {x.code: x for x in s.scalars(select(m.Party))}
            self.sources = {x.id: x for x in s.scalars(select(m.Source))}
            self.datasets = list(s.scalars(select(m.DatasetStatus)))
            self.persons = {x.id: x for x in s.scalars(select(m.Person))}
            self.offices = {x.id: x for x in s.scalars(select(m.Office))}
            self.kv = {x.key: x.value for x in s.scalars(select(m.KeyValue))}
            self.holding = {}
            for h in s.scalars(select(m.Holding).where(m.Holding.status.in_(("current", "vacant")))):
                self.holding[h.office_id] = h
            self.elections = {x.id: x for x in s.scalars(select(m.Election))}
            self.election_by_office = {x.office_id: x for x in self.elections.values()}
            self.cands = defaultdict(list)
            hist = defaultdict(list)
            for hh in s.scalars(select(m.CandidacyHistory)):
                hist[hh.candidacy_id].append(hh)
            for c in s.scalars(select(m.Candidacy)):
                c._hist = sorted(hist[c.id], key=lambda r: r.recorded_at)  # type: ignore[attr-defined]
                self.cands[c.election_id].append(c)
            fc = defaultdict(dict)
            for f in s.scalars(select(m.Forecast)):
                cur = fc[f.election_id].get(f.forecaster)
                if cur is None or f.published_on > cur.published_on:
                    fc[f.election_id][f.forecaster] = f
            self.forecasts = fc
        self.running_in = {}  # person_id -> 120th-map election id
        for e in self.elections.values():
            for inc in e.incumbents:
                if inc.get("person_id") and self.offices[e.office_id].map_version == 120:
                    self.running_in[inc["person_id"]] = e.id
        self.built_at = time.time()


_snap: Snapshot | None = None
_lock = threading.Lock()


def snapshot(force: bool = False) -> Snapshot:
    global _snap
    with _lock:
        if force or _snap is None or time.time() - _snap.built_at > config.CACHE_TTL_SECONDS:
            _snap = Snapshot()
        return _snap


def source_view(sn: Snapshot, sid: str) -> dict:
    s = sn.sources[sid]
    return {"id": s.id, "name_ar": s.name_ar, "name_en": s.name_en, "url": s.url, "kind": s.kind,
            "verified_at": s.verified_at, "valid_as_of": s.valid_as_of, "note": s.note}


def state_view(sn: Snapshot, abbr: str) -> dict:
    s = sn.states[abbr]
    return {"abbr": s.abbr, "fips": s.fips, "name_ar": s.name_ar, "name_en": s.name_en,
            "capital_ar": s.capital_ar, "capital_en": s.capital_en, "kind": s.kind}


def person_view(sn: Snapshot, pid: str | None) -> dict | None:
    if not pid or pid not in sn.persons:
        return None
    p = sn.persons[pid]
    return {"id": p.id, "name_en": p.name_en, "name_ar": p.name_ar, "photo_url": p.photo_url,
            "website": p.website, "wikipedia": f"https://en.wikipedia.org/wiki/{p.wikipedia.replace(' ', '_')}"
            if p.wikipedia else None, "bioguide": p.bioguide,
            "profile_url": f"https://bioguide.congress.gov/search/bio/{p.bioguide}" if p.bioguide else None}


def candidacy_view(c: m.Candidacy) -> dict:
    return {"name_en": c.name_en, "name_ar": c.name_ar, "party": c.party, "party_label": c.party_label,
            "is_incumbent": c.is_incumbent, "status": c.status, "stage": c.stage, "data_type": c.data_type,
            "fec_id": c.fec_id, "source_id": c.source_id, "fec_url": f"https://www.fec.gov/data/candidate/{c.fec_id}/" if c.fec_id else None,
            "first_seen": c.first_seen, "last_changed": c.last_changed,
            "history": [{"status": h.status, "party": h.party, "recorded_at": h.recorded_at} for h in c._hist]}  # type: ignore[attr-defined]


def forecast_view(f: m.Forecast) -> dict:
    return {"forecaster": f.forecaster, "name": f.forecaster_name, "url": f.forecaster_url, "label": f.rating_label,
            "party": f.rating_party, "level": f.rating_level, "level_ar": RATING_LEVEL_AR[f.rating_level],
            "flip": f.flip, "published_on": f.published_on, "data_type": "estimate"}


def election_view(sn: Snapshot, eid: str | None, ref: date) -> dict | None:
    if eid is None or eid not in sn.elections:
        return None
    e = sn.elections[eid]
    d = date.fromisoformat(e.election_date)
    delta = (d - ref).days
    cands = sorted(sn.cands.get(eid, []), key=lambda c: ({"R": 0, "D": 1}.get(c.party, 2), c.name_en))
    declared = [candidacy_view(c) for c in cands if c.status == "declared"]
    potential = [candidacy_view(c) for c in cands if c.status == "potential"]
    dropped = [candidacy_view(c) for c in cands if c.status in ("withdrawn", "not_listed")]
    fcs = [forecast_view(f) for f in sn.forecasts.get(eid, {}).values()]
    fcs.sort(key=lambda f: f["forecaster"])
    return {
        "id": e.id, "kind": e.kind, "cycle": e.cycle, "date": e.election_date,
        "primary_date": e.primary_date, "runoff_date": e.runoff_date, "filing_deadline": e.filing_deadline,
        "days_until": delta, "phase": "upcoming" if delta > 0 else ("election_day" if delta == 0 else "ended"),
        "incumbent_status": e.incumbent_status, "status_text": e.status_text, "incumbents": e.incumbents,
        "defending_party": e.defending_party, "pvi": e.pvi, "is_open": e.is_open,
        "uncontested": e.uncontested, "candidates_undetermined": e.candidates_undetermined,
        "candidates": declared, "candidate_sources": [source_view(sn, i) for i in sorted({c.source_id for c in cands if c.status == "declared"})],
        "potential_candidates": potential, "dropped_candidates": dropped,
        "forecasts": fcs,
        "competitive_by": [f["forecaster"] for f in fcs if f["level"] <= 2],
        "tossup_by": [f["forecaster"] for f in fcs if f["level"] == 0],
        "forecast_note": FORECAST_NOTE,
        "source": source_view(sn, e.source_id),
        "results_note": "انتهى الاقتراع؛ لا تتضمن هذه النسخة نتائج رسمية بعد." if delta < 0 else None,
    }


def holder_view(sn: Snapshot, office_id: str) -> dict:
    h = sn.holding.get(office_id)
    if h is None or h.status == "vacant":
        return {"vacant": True, "party": None, "person": None, "term_start": None, "term_end": None,
                "meta": h.meta if h else {}, "source": source_view(sn, h.source_id) if h else None,
                "data_type": "official"}
    return {"vacant": False, "party": h.party, "person": person_view(sn, h.person_id), "term_start": h.term_start,
            "term_end": h.term_end, "meta": h.meta, "source": source_view(sn, h.source_id),
            "data_type": h.data_type, "completeness": h.completeness}


def governors(ref: date) -> list[dict]:
    sn = snapshot()
    out = []
    for o in sorted((o for o in sn.offices.values() if o.kind == "governor"), key=lambda o: o.state):
        out.append({"office_id": o.id, "state": state_view(sn, o.state), "holder": holder_view(sn, o.id),
                    "next_election_year": o.next_election_year,
                    "election": election_view(sn, sn.election_by_office.get(o.id).id if o.id in sn.election_by_office else None, ref)})
    return out


def senate(ref: date) -> list[dict]:
    sn = snapshot()
    out = []
    for o in sorted((o for o in sn.offices.values() if o.kind == "senate"), key=lambda o: (o.state, o.senate_class)):
        el = sn.election_by_office.get(o.id)
        h = sn.holding.get(o.id)
        vacant = h is None or h.status == "vacant"
        out.append({"office_id": o.id, "state": state_view(sn, o.state), "senate_class": o.senate_class,
                    "holder": holder_view(sn, o.id), "next_election_year": o.next_election_year,
                    # 'vacant' (no holder) is distinct from 'up' (on the ballot) and 'not_up'
                    "seat_status": "vacant" if vacant else ("up" if el else "not_up"),
                    "election": election_view(sn, el.id if el else None, ref)})
    return out


def house(map_version: int, ref: date) -> list[dict]:
    sn = snapshot()
    out = []
    offices = [o for o in sn.offices.values() if o.kind == "house" and o.map_version == map_version]
    for o in sorted(offices, key=lambda o: o.geoid):
        row = {"office_id": o.id, "geoid": o.geoid, "state": state_view(sn, o.state), "district": o.district,
               "at_large": o.district == 0, "delegate": o.geoid[2:] == "98", "map_version": map_version}
        if map_version == 119:
            hv = holder_view(sn, o.id)
            row["holder"] = hv
            pid = hv["person"]["id"] if hv["person"] else None
            eid = sn.running_in.get(pid) if pid else None
            if eid:
                e = sn.elections[eid]
                row["running_2026"] = {"election_id": eid, "geoid": sn.offices[e.office_id].geoid,
                                       "status_text": e.status_text, "incumbent_status": e.incumbent_status}
            else:
                row["running_2026"] = None
        else:
            el = sn.election_by_office.get(o.id)
            row["election"] = election_view(sn, el.id if el else None, ref)
        out.append(row)
    return out


def summary(ref: date) -> dict:
    """Official current distribution (no forecasts mixed in)."""
    sn = snapshot()
    gov = defaultdict(int)
    for o in sn.offices.values():
        if o.kind == "governor":
            gov[sn.holding[o.id].party or "U"] += 1
    sen = defaultdict(int)
    sen_up = defaultdict(int)
    for o in sn.offices.values():
        if o.kind == "senate":
            h = sn.holding.get(o.id)
            p = h.party if h and h.status == "current" else "vacant"
            sen[p] += 1
            if o.id in sn.election_by_office:
                sen_up[p] += 1
    hou = defaultdict(int)
    for o in sn.offices.values():
        if o.kind == "house" and o.map_version == 119 and o.geoid[2:] != "98":
            h = sn.holding.get(o.id)
            hou[h.party if h and h.status == "current" else "vacant"] += 1
    return {"governors": dict(gov), "senate": dict(sen), "senate_up": dict(sen_up), "house": dict(hou),
            "house_voting_seats": sum(hou.values()), "reference_date": ref.isoformat()}


def meta(ref: date) -> dict:
    sn = snapshot()
    stale_days = config.STALE_AFTER_DAYS
    ds = []
    for d in sn.datasets:
        age = None
        if d.verified_at:
            age = (datetime.now(timezone.utc) - datetime.fromisoformat(d.verified_at.replace("Z", "+00:00"))).days
        ds.append({"name": d.name, "label": d.label, "updated_at": d.updated_at, "verified_at": d.verified_at,
                   "last_attempt_at": d.last_attempt_at, "status": d.status, "message": d.message,
                   "row_count": d.row_count, "sources": d.source_ids, "age_days": age,
                   "stale": age is not None and age > stale_days})
    return {
        "reference_date": ref.isoformat(),
        "constants": sn.kv.get("constants", {}),
        "update_mode": "تحديث دوري/يدوي عبر سكربت الاستيراد (ليس لحظيًا)",
        "build": sn.kv.get("build", {}),
        "datasets": ds,
        "sources": [source_view(sn, k) for k in sorted(sn.sources)],
        "parties": [{"code": p.code, "name_en": p.name_en, "name_ar": p.name_ar, "group": p.group, "color": p.color}
                    for p in sn.parties.values()],
        "states": [state_view(sn, a) for a in sorted(sn.states)],
        "quality": sn.kv.get("quality", {}),
        "forecast_note": FORECAST_NOTE,
    }


def search(q: str, ref: date, limit: int = 25) -> list[dict]:
    sn = snapshot()
    qn = q.strip().lower()
    if len(qn) < 2:
        return []
    res: list[dict] = []

    def hit(*vals) -> bool:
        return any(v and qn in v.lower() for v in vals)

    for s in sn.states.values():
        if s.kind == "state" and hit(s.name_en, s.name_ar, s.abbr, s.capital_en, s.capital_ar):
            res.append({"type": "state", "label": s.name_ar, "sub": s.name_en, "state": s.abbr})
    for o in sn.offices.values():
        h = sn.holding.get(o.id)
        if not h or h.status != "current" or o.map_version == 120:
            continue
        p = sn.persons.get(h.person_id)
        if p and hit(p.name_en, p.name_ar):
            label = {"governor": "حاكم", "senate": "عضو مجلس شيوخ", "house": "نائب"}[o.kind]
            res.append({"type": o.kind, "label": p.name_ar or p.name_en, "sub": f"{p.name_en} · {label} · {o.state}",
                        "state": o.state, "office_id": o.id, "geoid": o.geoid})
    for eid, cs in sn.cands.items():
        for c in cs:
            if c.status == "declared" and hit(c.name_en, c.name_ar):
                o = sn.offices[sn.elections[eid].office_id]
                res.append({"type": "candidate", "label": c.name_ar or c.name_en,
                            "sub": f"{c.name_en} · مرشح · {o.kind} {o.state}", "state": o.state,
                            "office_id": o.id, "election_id": eid, "geoid": o.geoid, "kind": o.kind})
    return res[:limit]
