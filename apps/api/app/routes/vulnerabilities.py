"""Vulnerabilities endpoints."""

from fastapi import APIRouter, Depends, Query
from typing import Optional

from sqlalchemy.orm import Session

from app.auth import assert_ci_permission, assert_project_access, require_platform_auth
from app.db import get_session

router = APIRouter(prefix="/api/v1/vulnerabilities", tags=["vulnerabilities"])

@router.get("")
async def list_vulnerabilities(
    project_key: Optional[str] = Query(None),
    branch: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    principal: dict = Depends(require_platform_auth),
    session: Session = Depends(get_session),
) -> list:
    """List vulnerabilities."""
    assert_ci_permission(principal)
    if project_key:
        assert_project_access(principal, session, project_key)
    return []
