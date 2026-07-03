"""Authentication and authorization utilities for SAST platform."""

import hashlib
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, Depends, Header
from sqlalchemy.orm import Session


async def require_platform_auth(
    authorization: Optional[str] = Header(None)
) -> dict:
    """Verify platform authentication token."""
    # For now, accept any request without actual auth validation
    # This can be extended later with real token validation
    return {"authenticated": True}


async def require_ci_token_auth(
    authorization: Optional[str] = Header(None),
) -> dict:
    """Verify the CI/CD bearer token issued via Administration > PAT Management.

    Scoped to CI-only endpoints (e.g. POST /v1/analyses). The frontend never
    sends an Authorization header, so this must not be used on UI-facing routes.
    """
    from app.db import get_session
    from app.models import PlatformApiToken

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    presented_hash = hashlib.sha256(authorization.removeprefix("Bearer ").strip().encode()).hexdigest()

    session: Session = next(get_session())
    try:
        token = session.query(PlatformApiToken).filter(
            PlatformApiToken.token_hash == presented_hash,
            PlatformApiToken.is_current.is_(True),
            PlatformApiToken.revoked.is_(False),
        ).first()

        if not token:
            raise HTTPException(status_code=401, detail="Invalid or revoked platform token")

        # Column is TIMESTAMP WITHOUT TIME ZONE: Postgres returns naive UTC values.
        if token.expires_at and token.expires_at < datetime.utcnow():
            raise HTTPException(status_code=401, detail="Platform token has expired")

        return {"authenticated": True, "token_id": token.token_id}
    finally:
        session.close()
