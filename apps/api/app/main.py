from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.db import init_db
from app.routes.analysis import router as analysis_router
from app.routes.auth_entra import router as auth_entra_router
from app.routes.auth_local import router as auth_local_router
from app.routes.gates import router as gates_router
from app.routes.health import router as health_router
from app.routes.integrations import router as integrations_router
from app.routes.platform import router as platform_router
from app.routes.projects import router as projects_router
from app.routes.rules import router as rules_router
from app.routes.vulnerabilities import router as vulnerabilities_router


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    _auto_retention_cleanup()
    yield


def _auto_retention_cleanup() -> None:
    """Run retention cleanup on startup if auto-cleanup is enabled and last run was > 24 h ago."""
    from datetime import datetime, timedelta, timezone
    from app.db import SessionLocal
    from app.routes.platform import _get_setting, run_retention_cleanup

    session = SessionLocal()
    try:
        if _get_setting(session, "retention_auto_cleanup", "true").lower() not in {"1", "true", "yes"}:
            return
        last = _get_setting(session, "last_cleanup_at", "")
        if last:
            try:
                last_dt = datetime.fromisoformat(last)
                if last_dt.tzinfo is None:
                    last_dt = last_dt.replace(tzinfo=timezone.utc)
                if datetime.now(timezone.utc) - last_dt < timedelta(hours=24):
                    return
            except ValueError:
                pass
        result = run_retention_cleanup(session)
        print(f"[retention] startup cleanup: deleted {result['deleted_analyses']} analyses")
    except Exception as exc:
        print(f"[retention] startup cleanup failed: {exc}")
    finally:
        session.close()


app = FastAPI(title="SAST Platform API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health_router)
app.include_router(auth_entra_router)
app.include_router(auth_local_router)
app.include_router(analysis_router)
app.include_router(gates_router)
app.include_router(integrations_router)
app.include_router(platform_router)
app.include_router(projects_router)
app.include_router(rules_router)
app.include_router(vulnerabilities_router)


@app.options("/{full_path:path}")
async def options_handler(full_path: str):
    """Handle CORS preflight requests"""
    return JSONResponse(
        content={},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        }
    )


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"service": "api", "status": "running"}


# ── Static file serving (production only) ─────────────────────────────────────
# The `static/` dir is injected by the multi-stage Dockerfile (root Dockerfile,
# Stage 2). It does not exist in local dev, so this block is a no-op locally.
import os as _os  # noqa: E402
_static_dir = _os.path.join(_os.path.dirname(__file__), "..", "static")
if _os.path.isdir(_static_dir):
    from fastapi.staticfiles import StaticFiles  # noqa: E402
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")
