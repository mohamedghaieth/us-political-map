"""One-shot data refresh: fetch sources -> rebuild dataset -> load into the database.

    python -m ingest.update            (from backend/)  or  python ingest/update.py

If any step fails the previous database content is left untouched, every dataset is flagged
'failed' (the UI then shows the last successful verification date plus a warning) and the
process exits non-zero so a scheduler/CI notices.
"""
from __future__ import annotations

import subprocess
import sys
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))


def main() -> int:
    import load_db

    try:
        subprocess.run([sys.executable, str(HERE / "fetch_sources.py"), "--force"], check=True)
        subprocess.run([sys.executable, str(HERE / "build_dataset.py")], check=True)
        load_db.load()
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        load_db.mark_failed(f"{type(exc).__name__}: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
