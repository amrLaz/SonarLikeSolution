"""Health check endpoints."""

from fastapi import APIRouter

router = APIRouter(prefix="/api/v1", tags=["health"])

@router.get("/health")
async def health() -> dict:
    """Health check endpoint."""
    return {"status": "ok"}
