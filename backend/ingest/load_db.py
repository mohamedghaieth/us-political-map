"""Load data/processed/dataset.json into the database.

* Reference tables are upserted.
* Holdings that disappear from the source are kept with status 'former' (history is not lost).
* Candidacies are matched by (election, normalized name). New ones get a history row; a changed
  status/party adds a history row; ones no longer listed become 'not_listed' (never deleted).
* Forecasts are appended per (election, forecaster, publication date), so rating changes are kept.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sqlalchemy import select  # noqa: E402

from app import models as m  # noqa: E402
from app.config import DATASET_PATH  # noqa: E402
from app.db import SessionLocal, init_db  # noqa: E402
from build_dataset import norm_name  # noqa: E402


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load(path: Path = DATASET_PATH) -> dict:
    ds = json.loads(Path(path).read_text(encoding="utf-8"))
    init_db()
    ts = now()
    stats = {"candidacies_new": 0, "candidacies_changed": 0, "candidacies_removed": 0, "holdings_former": 0}
    with SessionLocal() as s:
        for p in ds["parties"]:
            s.merge(m.Party(**p))
        for st in ds["states"]:
            s.merge(m.State(**st))
        for src in ds["sources"]:
            s.merge(m.Source(**src))
        s.flush()
        for p in ds["persons"]:
            s.merge(m.Person(id=p["id"], name_en=p["name_en"], name_ar=p.get("name_ar"), bioguide=p.get("bioguide"),
                             wikipedia=p.get("wikipedia"), photo_url=p.get("photo_url"), website=p.get("website"),
                             fec_ids=p.get("fec_ids")))
        for o in ds["offices"]:
            s.merge(m.Office(**o))
        s.flush()

        # holdings: upsert by (office, person), mark vanished ones 'former'
        existing = {(h.office_id, h.person_id): h for h in s.scalars(select(m.Holding)).all()}
        incoming = set()
        for h in ds["holdings"]:
            key = (h["office_id"], h["person_id"])
            incoming.add(key)
            row = existing.get(key)
            if row is None:
                row = m.Holding(office_id=h["office_id"], person_id=h["person_id"], first_seen=ts)
                s.add(row)
            for k in ("party", "term_start", "term_end", "status", "source_id", "data_type", "completeness", "meta"):
                setattr(row, k, h[k])
            row.last_seen = ts
        for key, row in existing.items():
            if key not in incoming and row.status != "former":
                row.status = "former"
                stats["holdings_former"] += 1

        for e in ds["elections"]:
            s.merge(m.Election(id=e["id"], office_id=e["office_id"], kind=e["kind"], cycle=e["cycle"],
                               election_date=e["election_date"], primary_date=e.get("primary_date"),
                               runoff_date=e.get("runoff_date"), filing_deadline=e.get("filing_deadline"),
                               incumbent_status=e["incumbent_status"], status_text=e.get("status_text"),
                               incumbents=e["incumbents"], defending_party=e.get("defending_party"),
                               pvi=e.get("pvi"), is_open=e["is_open"],
                               candidates_undetermined=e["candidates_undetermined"], uncontested=e["uncontested"],
                               source_id=e["source_id"]))
        s.flush()

        cur = {(c.election_id, c.key): c for c in s.scalars(select(m.Candidacy)).all()}
        seen = set()
        for c in ds["candidacies"]:
            key = norm_name(c["name_en"])[:120]
            k = (c["election_id"], key)
            seen.add(k)
            row = cur.get(k)
            if row is None:
                row = m.Candidacy(election_id=c["election_id"], key=key, name_en=c["name_en"], name_ar=c.get("name_ar"),
                                  party=c["party"], party_label=c["party_label"], status=c["status"], stage=c["stage"],
                                  is_incumbent=c["is_incumbent"], fec_id=c.get("fec_id"), source_id=c["source_id"],
                                  data_type=c["data_type"], first_seen=ts, last_changed=ts)
                row.history.append(m.CandidacyHistory(status=c["status"], party=c["party"], recorded_at=ts))
                s.add(row)
                stats["candidacies_new"] += 1
                continue
            if row.status != c["status"] or row.party != c["party"]:
                row.history.append(m.CandidacyHistory(status=c["status"], party=c["party"], recorded_at=ts))
                row.last_changed = ts
                stats["candidacies_changed"] += 1
            row.name_en, row.name_ar, row.party, row.party_label = c["name_en"], c.get("name_ar"), c["party"], c["party_label"]
            row.status, row.stage, row.is_incumbent, row.fec_id = c["status"], c["stage"], c["is_incumbent"], c.get("fec_id")
            row.source_id, row.data_type = c["source_id"], c["data_type"]
        for k, row in cur.items():
            if k not in seen and row.status != "not_listed":
                row.history.append(m.CandidacyHistory(status="not_listed", party=row.party, recorded_at=ts))
                row.status, row.last_changed = "not_listed", ts
                stats["candidacies_removed"] += 1

        old_f = {(f.election_id, f.forecaster, f.published_on) for f in s.scalars(select(m.Forecast)).all()}
        for f in ds["forecasts"]:
            if (f["election_id"], f["forecaster"], f["published_on"]) not in old_f:
                s.add(m.Forecast(**f))
                old_f.add((f["election_id"], f["forecaster"], f["published_on"]))

        for d in ds["datasets"]:
            s.merge(m.DatasetStatus(name=d["name"], label=d["label"], updated_at=d["updated_at"],
                                    verified_at=d["verified_at"], last_attempt_at=ts, status="ok", message="",
                                    row_count=d["row_count"], source_ids=d["source_ids"]))
        s.merge(m.KeyValue(key="quality", value=ds["quality"]))
        s.merge(m.KeyValue(key="constants", value=ds["meta"]["constants"]))
        s.merge(m.KeyValue(key="build", value={"generated_at": ds["meta"]["generated_at"],
                                               "fetched_at": ds["meta"]["fetched_at"], "loaded_at": ts}))
        s.commit()
    print("loaded", json.dumps(stats))
    return stats


def mark_failed(message: str) -> None:
    """Keep serving the last good data; record the failure so the UI can warn."""
    init_db()
    ts = now()
    with SessionLocal() as s:
        rows = s.scalars(select(m.DatasetStatus)).all()
        for r in rows:
            r.status, r.message, r.last_attempt_at = "failed", message[:500], ts
        s.commit()


if __name__ == "__main__":
    load()
