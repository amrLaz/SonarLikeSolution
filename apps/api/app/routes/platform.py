"""Platform endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db import get_session

router = APIRouter(prefix="/api/v1/platform", tags=["platform"])

@router.get("/token/status")
async def get_token_status(session: Session = Depends(get_session)) -> dict:
    """Get platform token status."""
    return {"status": "active"}

@router.get("/token/history")
async def get_token_history(session: Session = Depends(get_session)) -> list:
    """Get platform token history."""
    return []
