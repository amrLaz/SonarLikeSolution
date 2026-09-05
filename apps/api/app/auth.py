"""Authentication and authorisation utilities for SAST platform.

Token format: base64url(json_payload) + "." + hmac_sha256_hex
Secret is auto-generated on first startup and persisted in platform_settings.
"""

import base64
import hashlib
import hmac as _hmac
import json
import logging
import os
import secrets
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.db import get_session

_log = logging.getLogger(__name__)

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


# ── Principals and scoped access ──────────────────────────────────────────────

def _bearer_token(authorization: Optional[str]) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        _log.warning(
            "Authentication required credential_present=%s bearer_scheme=%s",
            bool(authorization), bool(authorization and authorization.startswith("Bearer ")),
        )
        raise HTTPException(status_code=401, detail="Authentication required")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        _log.warning("Authentication required empty_bearer=true")
        raise HTTPException(status_code=401, detail="Authentication required")
    return token


def _active_user_principal(token: str, session: Session) -> Optional[dict]:
    from app.models import PlatformUser

    payload = verify_session_token(token, session)
    if not payload:
        return None
    user = session.query(PlatformUser).filter(
        PlatformUser.user_id == payload.get("sub"),
        PlatformUser.is_active.is_(True),
    ).first()
    if not user:
        return None
    return {
        "kind": "user",
        "sub": user.user_id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
    }


def _active_ci_principal(token: str, session: Session) -> Optional[dict]:
    from app.models import PlatformApiToken

    presented_hash = hashlib.sha256(token.encode()).hexdigest()
    record = session.query(PlatformApiToken).filter(
        PlatformApiToken.token_hash == presented_hash,
        PlatformApiToken.is_current.is_(True),
        PlatformApiToken.revoked.is_(False),
    ).first()
    if not record:
        return None
    expires_at = record.expires_at
    if expires_at:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= datetime.now(timezone.utc):
            return None
    try:
        scopes = set(json.loads(record.scopes or "[]"))
    except (TypeError, ValueError):
        scopes = set()
    return {
        "kind": "ci",
        "token_id": record.token_id,
        "role": "ci",
        "scopes": sorted(scopes),
    }


async def require_user_auth(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
) -> dict:
    principal = _active_user_principal(_bearer_token(authorization), session)
    if not principal:
        _log.warning("User authentication denied")
        raise HTTPException(status_code=401, detail="Invalid, expired, or inactive session")
    return principal

def require_role(*allowed_roles: str):
    """Dependency factory — use as Depends(require_role("admin")) on a route."""
    async def _check(
        authorization: Optional[str] = Header(None),
        session: Session = Depends(get_session),
    ) -> dict:
        payload = _active_user_principal(_bearer_token(authorization), session)
        if not payload:
            _log.warning("User authentication denied for role-protected route")
            raise HTTPException(status_code=401, detail="Invalid, expired, or inactive session")
        role = payload["role"]
        if role not in allowed_roles:
            _log.warning("Authorization denied user_id=%s role=%s", payload.get("sub"), role)
            raise HTTPException(
                status_code=403,
                detail=f"This action requires one of: {', '.join(allowed_roles)}",
            )
        return payload
    return _check


async def require_platform_auth(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
) -> dict:
    """Authenticate an active platform user or a scoped CI token."""
    raw = _bearer_token(authorization)
    principal = _active_user_principal(raw, session) or _active_ci_principal(raw, session)
    if not principal:
        _log.warning("Platform authentication denied")
        raise HTTPException(status_code=401, detail="Invalid, expired, revoked, or inactive credential")
    return principal


async def optional_platform_auth(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
) -> Optional[dict]:
    if not authorization:
        return None
    return await require_platform_auth(authorization, session)


# ── CI token auth (unchanged) ─────────────────────────────────────────────────

async def require_ci_token_auth(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
) -> dict:
    """Verify the CI/CD bearer token issued via Administration > PAT Management."""
    principal = _active_ci_principal(_bearer_token(authorization), session)
    if not principal:
        _log.warning("CI authentication denied")
        raise HTTPException(status_code=401, detail="Invalid, expired, or revoked platform token")
    return principal


def allowed_project_keys(principal: dict, session: Session, permission: str = "read") -> set[str]:
    """Return project keys explicitly visible to this principal."""
    from app.models import Project, TokenProjectAccess, UserGrant

    if principal.get("kind") == "user" and principal.get("role") == "admin":
        return {key for (key,) in session.query(Project.key).all()}
    if principal.get("kind") == "ci":
        required_scope = {
            "read": "analysis:read",
            "analysis:write": "analysis:write",
            "integration:write": "integration:write",
        }.get(permission)
        if not required_scope or required_scope not in set(principal.get("scopes", [])):
            return set()
        return {
            key for (key,) in session.query(TokenProjectAccess.project_key).filter(
                TokenProjectAccess.token_id == principal.get("token_id")
            ).all()
        }
    if principal.get("kind") != "user":
        return set()
    grants = session.query(UserGrant).filter(UserGrant.user_id == principal.get("sub")).all()
    project_keys = {g.scope_id for g in grants if g.scope_type == "project"}
    organization_ids = {g.scope_id for g in grants if g.scope_type == "organization"}
    if organization_ids:
        project_keys.update(
            key for (key,) in session.query(Project.key).filter(
                Project.organization_id.in_(organization_ids)
            ).all()
        )
    return project_keys


def assert_ci_permission(principal: dict, permission: str = "read") -> None:
    if principal.get("kind") != "ci":
        return
    required_scope = {
        "read": "analysis:read",
        "analysis:write": "analysis:write",
        "integration:write": "integration:write",
    }.get(permission)
    if not required_scope or required_scope not in set(principal.get("scopes", [])):
        raise HTTPException(status_code=403, detail="Credential scope does not allow this action")


def assert_project_access(
    principal: dict,
    session: Session,
    project_key: str,
    permission: str = "read",
) -> None:
    """Enforce project membership and the requested CI capability."""
    if project_key not in allowed_project_keys(principal, session, permission):
        _log.warning(
            "Project authorization denied principal_kind=%s principal_id=%s project=%s permission=%s",
            principal.get("kind"), principal.get("sub") or principal.get("token_id"), project_key, permission,
        )
        raise HTTPException(status_code=403, detail="Project access denied")
    if principal.get("kind") == "ci":
        try:
            assert_ci_permission(principal, permission)
        except HTTPException:
            _log.warning(
                "CI scope denied token_id=%s project=%s permission=%s",
                principal.get("token_id"), project_key, permission,
            )
            raise
    elif permission != "read" and principal.get("role") != "admin":
        _log.warning(
            "User mutation denied user_id=%s project=%s permission=%s",
            principal.get("sub"), project_key, permission,
        )
        raise HTTPException(status_code=403, detail="Administrator role required")


def effective_permissions(principal: dict, session: Session) -> dict:
    return {
        "is_admin": principal.get("kind") == "user" and principal.get("role") == "admin",
        "project_keys": sorted(allowed_project_keys(principal, session)),
    }
