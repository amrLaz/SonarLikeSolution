"""Azure AD / Entra ID OIDC authentication flow.

Flow:
  1. Frontend calls GET /login  →  backend returns Microsoft auth URL
  2. Browser redirects to Microsoft login
  3. Microsoft redirects back to GET /callback?code=...
  4. Backend exchanges code for ID token (server-side, client_secret stays hidden)
  5. Backend extracts user claims and redirects to /?entra_session=<base64-json>
  6. Frontend reads param, stores session in localStorage, clears URL
"""

import base64
import json
import secrets
import urllib.parse
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.auth import sign_session_token
from app.db import get_session
from app.models import AuthProviderConfig, PlatformUser

router = APIRouter(prefix="/api/v1/auth/entra", tags=["auth-entra"])


def _load_azure_ad_config(session: Session) -> dict[str, Any]:
    """Load the enabled azure-ad provider config or raise 400."""
    provider = (
        session.query(AuthProviderConfig)
        .filter(AuthProviderConfig.provider_type == "azure-ad")
        .first()
    )
    if not provider or not provider.enabled:
        raise HTTPException(status_code=400, detail="Azure AD authentication is not enabled")
    try:
        config: dict[str, Any] = json.loads(provider.config or "{}")
    except Exception:
        config = {}
    missing = [k for k in ("tenant_id", "client_id", "client_secret") if not config.get(k)]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Azure AD config incomplete — missing: {', '.join(missing)}",
        )
    return config


@router.get("/login")
async def entra_login(session: Session = Depends(get_session)) -> dict[str, str]:
    """Return the Microsoft authorization URL for the Entra OIDC flow."""
    config = _load_azure_ad_config(session)
    params = {
        "client_id": config["client_id"],
        "response_type": "code",
        "redirect_uri": config.get("redirect_uri", ""),
        "scope": config.get("scopes", "openid profile email"),
        "state": secrets.token_urlsafe(16),
        "response_mode": "query",
    }
    auth_url = (
        f"https://login.microsoftonline.com/{config['tenant_id']}/oauth2/v2.0/authorize?"
        + urllib.parse.urlencode(params)
    )
    return {"auth_url": auth_url}


@router.get("/callback")
async def entra_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    session: Session = Depends(get_session),
):
    """Handle Microsoft authorization code callback and redirect to the SPA."""
    if error:
        msg = urllib.parse.quote(error_description or error)
        return RedirectResponse(url=f"/?entra_error={msg}")

    if not code:
        return RedirectResponse(url="/?entra_error=missing_authorization_code")

    try:
        config = _load_azure_ad_config(session)
    except HTTPException as exc:
        return RedirectResponse(url=f"/?entra_error={urllib.parse.quote(str(exc.detail))}")

    token_url = (
        f"https://login.microsoftonline.com/{config['tenant_id']}/oauth2/v2.0/token"
    )
    async with httpx.AsyncClient(timeout=15) as http:
        resp = await http.post(
            token_url,
            data={
                "grant_type": "authorization_code",
                "client_id": config["client_id"],
                "client_secret": config["client_secret"],
                "redirect_uri": config.get("redirect_uri", ""),
                "code": code,
                "scope": config.get("scopes", "openid profile email"),
            },
        )

    if resp.status_code != 200:
        try:
            err_msg = resp.json().get("error_description", "Token exchange failed")
        except Exception:
            err_msg = "Token exchange failed"
        return RedirectResponse(url=f"/?entra_error={urllib.parse.quote(err_msg)}")

    token_data: dict[str, Any] = resp.json()
    claims = _decode_jwt_payload(token_data.get("id_token", ""))

    full_name: str = (
        claims.get("name")
        or claims.get("preferred_username")
        or "Entra User"
    )
    email: str = (
        claims.get("email")
        or claims.get("preferred_username")
        or claims.get("upn", "")
    )

    # Upsert the user in platform_users and issue a signed session token.
    # Wrapped in try/except so that a DB migration lag (e.g. table not yet
    # created on first production deploy) never blocks the user from logging in.
    platform_token: str | None = None
    role = "regular"
    try:
        db_user = session.query(PlatformUser).filter(PlatformUser.email == email).first()
        if not db_user:
            db_user = PlatformUser(
                user_id=str(uuid.uuid4()),
                email=email,
                full_name=full_name,
                role="regular",       # first SSO login gets analyst role
                auth_provider="entra",
                is_active=True,
            )
            session.add(db_user)
        else:
            db_user.full_name = full_name
            db_user.last_login_at = datetime.now(timezone.utc)
        session.commit()
        role = db_user.role
        platform_token = sign_session_token(
            {"sub": db_user.user_id, "email": db_user.email, "full_name": db_user.full_name, "role": role},
            session,
        )
    except Exception as exc:
        print(f"[entra] RBAC upsert failed (non-fatal): {exc}")
        try:
            session.rollback()
        except Exception:
            pass

    payload: dict[str, Any] = {
        "full_name": full_name,
        "email": email,
        "access_role": role,
    }
    if platform_token:
        payload["token"] = platform_token

    session_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()
    return RedirectResponse(url=f"/?entra_session={session_b64}")


def _decode_jwt_payload(token: str) -> dict[str, Any]:
    """Decode the payload of a JWT without verifying the signature.

    Safe here because the token was received directly from Microsoft's
    token endpoint over TLS — we trust the source, not the signature.
    """
    try:
        payload_b64 = token.split(".")[1]
        payload_b64 += "=" * (-len(payload_b64) % 4)
        return json.loads(base64.urlsafe_b64decode(payload_b64))
    except Exception:
        return {}
