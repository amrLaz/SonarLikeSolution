"""Health check endpoints."""

from fastapi import APIRouter

router = APIRouter(prefix="/api/v1/health", tags=["health"])

@router.get("")
async def health() -> dict:
    """Health check endpoint."""
    return {"status": "ok"}
