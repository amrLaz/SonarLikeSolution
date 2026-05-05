from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.db import init_db
from app.routes.analysis import router as analysis_router
from app.routes.gates import router as gates_router
from app.routes.integrations import router as integrations_router
from app.routes.platform import router as platform_router
from app.routes.projects import router as projects_router
from app.routes.vulnerabilities import router as vulnerabilities_router


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    yield


app = FastAPI(title="SAST Platform API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(analysis_router)
app.include_router(gates_router)
app.include_router(integrations_router)
app.include_router(platform_router)
app.include_router(projects_router)
app.include_router(vulnerabilities_router)


@app.get("/api/v1/health")
async def health() -> dict:
    """Health check endpoint."""
    return {"status": "ok"}


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


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "api", "status": "running"}
