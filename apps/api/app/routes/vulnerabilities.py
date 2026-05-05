"""Vulnerabilities endpoints."""

from fastapi import APIRouter, Query
from typing import Optional

router = APIRouter(prefix="/api/v1/vulnerabilities", tags=["vulnerabilities"])

@router.get("")
async def list_vulnerabilities(
    project_key: Optional[str] = Query(None),
    branch: Optional[str] = Query(None),
    severity: Optional[str] = Query(None)
) -> list:
    """List vulnerabilities."""
    return []
