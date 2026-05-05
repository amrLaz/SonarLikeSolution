"""Authentication and authorization utilities for SAST platform."""

from fastapi import HTTPException, Depends, Header
from typing import Optional


async def require_platform_auth(
    authorization: Optional[str] = Header(None)
) -> dict:
    """Verify platform authentication token."""
    # For now, accept any request without actual auth validation
    # This can be extended later with real token validation
    return {"authenticated": True}
