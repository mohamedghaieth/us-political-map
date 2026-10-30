"""Loader behaviour on an isolated database: history is preserved and failed updates are visible.
Runs in a subprocess so DATABASE_URL can point at a throwaway SQLite file."""
import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
DATASET = BACKEND.parent / "data" / "processed" / "dataset.json"

SCRIPT = textwrap.dedent(
    """
    import json, sys
    sys.path.insert(0, {backend!r}); sys.path.insert(0, {ingest!r})
    import load_db
    from app.db import SessionLocal
    from app import models as m
    from sqlalchemy import select

    ds = json.load(open({dataset!r}, encoding='utf-8'))
    p1 = {tmp!r} + '/d1.json'; p2 = {tmp!r} + '/d2.json'
    json.dump(ds, open(p1, 'w', encoding='utf-8'))
    first = load_db.load(p1)

    # second run: one candidate disappears, one changes party
    victim, changed = ds['candidacies'][0], ds['candidacies'][1]
    ds['candidacies'] = ds['candidacies'][1:]
    ds['candidacies'][0] = dict(changed, party='O')
    json.dump(ds, open(p2, 'w', encoding='utf-8'))
    second = load_db.load(p2)

    with SessionLocal() as s:
        gone = s.scalars(select(m.Candidacy).where(m.Candidacy.name_en == victim['name_en'], m.Candidacy.election_id == victim['election_id'])).one()
        out = {{"first": first, "second": second, "gone_status": gone.status, "gone_history": [h.status for h in gone.history]}}
        ch = s.scalars(select(m.Candidacy).where(m.Candidacy.name_en == changed['name_en'], m.Candidacy.election_id == changed['election_id'])).one()
        out["changed_history"] = len(ch.history)
        n_before = s.query(m.Candidacy).count()
    load_db.mark_failed('simulated network failure')
    with SessionLocal() as s:
        st = {{d.name: (d.status, d.message, d.verified_at) for d in s.scalars(select(m.DatasetStatus))}}
        out["failed"] = st
        out["candidacies_after_failure"] = s.query(m.Candidacy).count()
    out["candidacies_before_failure"] = n_before
    print(json.dumps(out))
    """
)


def test_history_kept_and_failure_flagged(tmp_path):
    env = dict(os.environ, DATABASE_URL=f"sqlite:///{(tmp_path / 't.db').as_posix()}", PYTHONIOENCODING="utf-8")
    code = SCRIPT.format(backend=str(BACKEND), ingest=str(BACKEND / "ingest"), dataset=str(DATASET), tmp=str(tmp_path))
    r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, env=env, cwd=BACKEND)
    assert r.returncode == 0, r.stderr
    out = json.loads(r.stdout.strip().splitlines()[-1])
    assert out["second"]["candidacies_removed"] == 1 and out["second"]["candidacies_changed"] == 1
    # the removed candidate is never deleted: status flips to not_listed and the earlier status stays in history
    assert out["gone_status"] == "not_listed"
    assert out["gone_history"] == ["declared", "not_listed"]
    assert out["changed_history"] == 2
    # a failed refresh keeps all data and flags every dataset while preserving the last successful verification date
    assert out["candidacies_after_failure"] == out["candidacies_before_failure"]
    assert all(s == "failed" and msg == "simulated network failure" and ver for s, msg, ver in out["failed"].values())
