"""Authentication and authorisation utilities for SAST platform.

Token format: base64url(json_payload) + "." + hmac_sha256_hex
Secret is auto-generated on first startup and persisted in platform_settings.
"""

import base64
import hashlib
import hmac as _hmac
import json
import os
import secrets
import time
import uuid
from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.db import get_session


# ── Password hashing (PBKDF2-SHA256, no extra deps) ───────────────────────────

def hash_password(password: str) -> str:
    salt = os.urandom(32)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return base64.b64encode(salt + key).decode()


def verify_password(password: str, stored: str) -> bool:
    try:
        data = base64.b64decode(stored.encode())
        salt, key = data[:32], data[32:]
        new_key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
        return _hmac.compare_digest(key, new_key)
    except Exception:
        return False


# ── Session token (HMAC-SHA256 signed JSON) ───────────────────────────────────

def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    s += "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s)


def _get_secret(session: Session) -> str:
    from app.models import PlatformSetting
    row = session.query(PlatformSetting).filter(PlatformSetting.key == "session_secret").first()
    if row:
        return row.value
    secret = secrets.token_hex(32)
    session.add(PlatformSetting(id=str(uuid.uuid4()), key="session_secret", value=secret))
    session.commit()
    return secret


def sign_session_token(payload: dict, session: Session) -> str:
    """Create a signed session token valid for 30 days."""
    secret = _get_secret(session)
    data = {**payload, "exp": int(time.time()) + 86400 * 30}
    header = _b64url_encode(json.dumps(data, separators=(",", ":")).encode())
    sig = _hmac.new(secret.encode(), header.encode(), hashlib.sha256).hexdigest()
    return f"{header}.{sig}"


def verify_session_token(token: str, session: Session) -> Optional[dict]:
    """Verify and decode a session token. Returns payload or None."""
    try:
        header, sig = token.rsplit(".", 1)
        secret = _get_secret(session)
        expected = _hmac.new(secret.encode(), header.encode(), hashlib.sha256).hexdigest()
        if not _hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(_b64url_decode(header))
        if payload.get("exp", 0) < int(time.time()):
            return None
        return payload
    except Exception:
        return None


# ── Role-based access control ─────────────────────────────────────────────────

def require_role(*allowed_roles: str):
    """Dependency factory — use as Depends(require_role("admin")) on a route."""
    async def _check(
        authorization: Optional[str] = Header(None),
        session: Session = Depends(get_session),
    ) -> dict:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Authentication required")
        token = authorization.removeprefix("Bearer ").strip()
        payload = verify_session_token(token, session)
        if not payload:
            raise HTTPException(status_code=401, detail="Invalid or expired session — please sign in again")
        role = payload.get("role", "default")
        if role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"This action requires one of: {', '.join(allowed_roles)}",
            )
        return payload
    return _check


# ── Legacy no-op kept for backward compat on read-only routes ─────────────────

async def require_platform_auth(
    authorization: Optional[str] = Header(None),
) -> dict:
    """No-op — kept so existing GET routes don't need touching. Write routes use require_role()."""
    return {"authenticated": True}


# ── CI token auth (unchanged) ─────────────────────────────────────────────────

async def require_ci_token_auth(
    authorization: Optional[str] = Header(None),
) -> dict:
    """Verify the CI/CD bearer token issued via Administration > PAT Management."""
    from app.models import PlatformApiToken

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    presented_hash = hashlib.sha256(
        authorization.removeprefix("Bearer ").strip().encode()
    ).hexdigest()

    session: Session = next(get_session())
    try:
        token = session.query(PlatformApiToken).filter(
            PlatformApiToken.token_hash == presented_hash,
            PlatformApiToken.is_current.is_(True),
            PlatformApiToken.revoked.is_(False),
        ).first()

        if not token:
            raise HTTPException(status_code=401, detail="Invalid or revoked platform token")

        if token.expires_at and token.expires_at < time.gmtime():
            raise HTTPException(status_code=401, detail="Platform token has expired")

        return {"authenticated": True, "token_id": token.token_id}
    finally:
        session.close()
