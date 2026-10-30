"""Runtime configuration (environment variables; no secrets are ever sent to the frontend)."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{(ROOT / 'data' / 'app.db').as_posix()}")
DATASET_PATH = Path(os.environ.get("DATASET_PATH", ROOT / "data" / "processed" / "dataset.json"))
FRONTEND_DIST = Path(os.environ.get("FRONTEND_DIST", ROOT / "frontend" / "dist"))
CACHE_TTL_SECONDS = int(os.environ.get("CACHE_TTL_SECONDS", "60"))
# Optional override of "today" for testing how date-dependent phases behave (YYYY-MM-DD).
REFERENCE_DATE = os.environ.get("REFERENCE_DATE")
# A dataset whose last successful verification is older than this is flagged as stale in the UI.
STALE_AFTER_DAYS = int(os.environ.get("STALE_AFTER_DAYS", "7"))
