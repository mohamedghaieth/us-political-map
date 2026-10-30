"""FastAPI application: read-only JSON API + (optionally) the built frontend."""
from __future__ import annotations

from datetime import date

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config, service
from .db import init_db

@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="الخريطة السياسية للولايات المتحدة - API", version="1.0.0", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1024)


def ref_date(as_of: str | None) -> date:
    if not as_of:
        return service.today()
    try:
        return date.fromisoformat(as_of)
    except ValueError as exc:
        raise HTTPException(422, "as_of must be YYYY-MM-DD") from exc


def cached(resp: Response, seconds: int = 60) -> None:
    resp.headers["Cache-Control"] = f"public, max-age={seconds}"


@app.get("/api/health")
def health() -> dict:
    try:
        sn = service.snapshot()
        return {"ok": True, "offices": len(sn.offices), "datasets": len(sn.datasets)}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(503, f"database unavailable: {exc}") from exc


@app.get("/api/meta")
def meta(resp: Response, as_of: str | None = None) -> dict:
    cached(resp)
    return service.meta(ref_date(as_of))


@app.get("/api/summary")
def summary(resp: Response, as_of: str | None = None) -> dict:
    cached(resp)
    return service.summary(ref_date(as_of))


@app.get("/api/governors")
def governors(resp: Response, as_of: str | None = None) -> list[dict]:
    cached(resp)
    return service.governors(ref_date(as_of))


@app.get("/api/senate")
def senate(resp: Response, as_of: str | None = None) -> list[dict]:
    cached(resp)
    return service.senate(ref_date(as_of))


@app.get("/api/house")
def house(resp: Response, map: int = Query(120, description="119 = current members' districts, 120 = 2026 election maps"),
          as_of: str | None = None) -> list[dict]:
    if map not in (119, 120):
        raise HTTPException(422, "map must be 119 or 120")
    cached(resp)
    return service.house(map, ref_date(as_of))


@app.get("/api/search")
def search(q: str = Query(min_length=2, max_length=60), as_of: str | None = None) -> list[dict]:
    return service.search(q, ref_date(as_of))


@app.post("/api/admin/reload")
def reload_snapshot() -> dict:
    """Drop the in-memory cache after an ingestion run (no data is changed here)."""
    service.snapshot(force=True)
    return {"ok": True}


# --- static frontend (production build) ---------------------------------------------------
if config.FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=config.FRONTEND_DIST / "assets"), name="assets")
    app.mount("/data", StaticFiles(directory=config.FRONTEND_DIST / "data"), name="data")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        f = config.FRONTEND_DIST / path
        if path and f.is_file():
            return FileResponse(f)
        return FileResponse(config.FRONTEND_DIST / "index.html")
