"""Microsoft Entra ID OIDC authorization-code flow."""

import base64
import hashlib
import json
import logging
import secrets
import urllib.parse
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from app.audit import log_event
from app.auth import sign_session_token
from app.db import get_session
from app.models import AuthProviderConfig, OidcTransaction, PlatformUser

router = APIRouter(prefix="/api/v1/auth/entra", tags=["auth-entra"])
_OIDC_COOKIE = "quality_hub_oidc"
_log = logging.getLogger(__name__)


def validate_redirect_uri(value: str) -> None:
    parsed = urllib.parse.urlparse(value)
    loopback_hosts = {"localhost", "127.0.0.1", "::1"}
    if parsed.scheme == "https" and parsed.netloc:
        return
    if parsed.scheme == "http" and parsed.hostname in loopback_hosts:
        return
    raise HTTPException(status_code=400, detail="Entra redirect_uri must use HTTPS except on loopback")


def _load_azure_ad_config(session: Session) -> dict[str, Any]:
    provider = session.query(AuthProviderConfig).filter(AuthProviderConfig.provider_type == "azure-ad").first()
    if not provider or not provider.enabled:
        raise HTTPException(status_code=400, detail="Azure AD authentication is not enabled")
    try:
        config: dict[str, Any] = json.loads(provider.config or "{}")
    except (TypeError, ValueError):
        config = {}
    missing = [
        key for key in ("tenant_id", "client_id", "client_secret", "redirect_uri")
        if not isinstance(config.get(key), str) or not config[key].strip()
    ]
    if missing:
        raise HTTPException(status_code=400, detail=f"Azure AD config incomplete — missing: {', '.join(missing)}")
    validate_redirect_uri(config["redirect_uri"])
    return config


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _verify_rs256_signature(token: str, jwks: dict[str, Any]) -> dict[str, Any]:
    """Verify an RS256 JWT with Microsoft's published signing key."""
    try:
        header = jwt.get_unverified_header(token)
        if header.get("alg") != "RS256" or not header.get("kid"):
            raise ValueError("unsupported token algorithm")
        jwk = next(
            key for key in jwks.get("keys", [])
            if key.get("kid") == header["kid"]
            and key.get("kty") == "RSA"
            and key.get("use", "sig") == "sig"
            and key.get("alg", "RS256") == "RS256"
        )
        key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk))
        return jwt.decode(
            token,
            key=key,
            algorithms=["RS256"],
            options={"verify_aud": False, "verify_iss": False, "verify_exp": False, "verify_nbf": False},
        )
    except (KeyError, StopIteration, ValueError, TypeError, jwt.PyJWTError) as exc:
        raise HTTPException(status_code=401, detail="Invalid Entra ID token") from exc


def _verify_oidc_id_token(
    token: str,
    config: dict[str, Any],
    expected_nonce: str,
    jwks: dict[str, Any],
    now: int | None = None,
) -> dict[str, Any]:
    claims = _verify_rs256_signature(token, jwks)
    timestamp = now if now is not None else int(datetime.now(timezone.utc).timestamp())
    audience = claims.get("aud")
    audience_valid = config["client_id"] in audience if isinstance(audience, list) else audience == config["client_id"]
    valid = (
        claims.get("iss") == f"https://login.microsoftonline.com/{config['tenant_id']}/v2.0"
        and claims.get("tid") == config["tenant_id"]
        and audience_valid
        and claims.get("nonce") == expected_nonce
        and int(claims.get("exp", 0)) > timestamp
        and int(claims.get("nbf", 0)) <= timestamp
        and int(claims.get("iat", timestamp)) <= timestamp + 60
        and bool(claims.get("oid"))
    )
    if not valid:
        raise HTTPException(status_code=401, detail="Invalid Entra ID token claims")
    return claims


def _consume_transaction(session: Session, state: str | None, browser_cookie: str | None) -> OidcTransaction:
    if not state or not browser_cookie:
        raise HTTPException(status_code=400, detail="Invalid or missing OIDC transaction")
    transaction = session.get(OidcTransaction, _hash(state))
    now = datetime.now(timezone.utc)
    if not transaction:
        raise HTTPException(status_code=400, detail="Invalid or missing OIDC transaction")
    expires_at = transaction.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    invalid = transaction.used_at or expires_at <= now or not secrets.compare_digest(transaction.cookie_hash, _hash(browser_cookie))
    if invalid:
        raise HTTPException(status_code=400, detail="Expired, replayed, or browser-mismatched OIDC transaction")
    updated = session.query(OidcTransaction).filter(
        OidcTransaction.state_hash == transaction.state_hash,
        OidcTransaction.cookie_hash == _hash(browser_cookie),
        OidcTransaction.used_at.is_(None),
        OidcTransaction.expires_at > now,
    ).update({OidcTransaction.used_at: now}, synchronize_session=False)
    if updated != 1:
        session.rollback()
        raise HTTPException(status_code=400, detail="Expired or replayed OIDC transaction")
    session.commit()
    transaction.used_at = now
    return transaction


@router.get("/login")
async def entra_login(response: Response, session: Session = Depends(get_session)) -> dict[str, str]:
    config = _load_azure_ad_config(session)
    state, browser_secret, nonce = (secrets.token_urlsafe(32) for _ in range(3))
    session.add(OidcTransaction(
        state_hash=_hash(state), cookie_hash=_hash(browser_secret), nonce=nonce,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    ))
    session.commit()
    response.set_cookie(
        _OIDC_COOKIE, browser_secret, max_age=600, httponly=True,
        secure=config["redirect_uri"].startswith("https://"), samesite="lax",
        path="/api/v1/auth/entra",
    )
    params = {
        "client_id": config["client_id"], "response_type": "code",
        "redirect_uri": config["redirect_uri"], "scope": config.get("scopes", "openid profile email"),
        "state": state, "nonce": nonce, "response_mode": "query",
    }
    return {"auth_url": f"https://login.microsoftonline.com/{config['tenant_id']}/oauth2/v2.0/authorize?{urllib.parse.urlencode(params)}"}


@router.get("/callback")
async def entra_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    quality_hub_oidc: str | None = Cookie(None),
    session: Session = Depends(get_session),
):
    try:
        transaction = _consume_transaction(session, state, quality_hub_oidc)
        if error:
            raise HTTPException(status_code=401, detail=error_description or error)
        if not code:
            raise HTTPException(status_code=400, detail="Missing authorization code")
        config = _load_azure_ad_config(session)
        token_url = f"https://login.microsoftonline.com/{config['tenant_id']}/oauth2/v2.0/token"
        jwks_url = config.get("jwks_uri") or f"https://login.microsoftonline.com/{config['tenant_id']}/discovery/v2.0/keys"
        async with httpx.AsyncClient(timeout=15) as http:
            token_response = await http.post(token_url, data={
                "grant_type": "authorization_code", "client_id": config["client_id"],
                "client_secret": config["client_secret"], "redirect_uri": config["redirect_uri"],
                "code": code, "scope": config.get("scopes", "openid profile email"),
            })
            token_response.raise_for_status()
            jwks_response = await http.get(jwks_url)
            jwks_response.raise_for_status()
        claims = _verify_oidc_id_token(token_response.json().get("id_token", ""), config, transaction.nonce, jwks_response.json())
        tenant_id = str(claims["tid"])
        object_id = str(claims["oid"])
        full_name = str(claims.get("name") or claims.get("preferred_username") or "Entra User")
        email = str(claims.get("email") or claims.get("preferred_username") or claims.get("upn") or "").lower()
        if not email:
            raise HTTPException(status_code=401, detail="Entra ID token has no usable email claim")

        db_user = session.query(PlatformUser).filter(
            PlatformUser.entra_tenant_id == tenant_id,
            PlatformUser.entra_object_id == object_id,
        ).first()
        is_new = db_user is None
        if not db_user:
            if session.query(PlatformUser).filter(PlatformUser.email == email).first():
                raise HTTPException(status_code=409, detail="An account with this email already exists and is not linked to this Entra identity")
            db_user = PlatformUser(
                user_id=str(uuid.uuid4()), email=email, full_name=full_name, role="default",
                auth_provider="entra", is_active=True, entra_tenant_id=tenant_id, entra_object_id=object_id,
            )
            session.add(db_user)
        elif not db_user.is_active:
            raise HTTPException(status_code=403, detail="This account is disabled")
        else:
            db_user.full_name = full_name
            db_user.email = email
        db_user.last_login_at = datetime.now(timezone.utc)
        log_event(session, email, db_user.role, "user.login.sso.first" if is_new else "user.login.sso", "session",
                  resource_label=email, details={"provider": "entra", "tenant_id": tenant_id})
        session.commit()
        platform_token = sign_session_token(
            {"sub": db_user.user_id, "email": db_user.email, "full_name": db_user.full_name, "role": db_user.role}, session
        )
        payload = {"full_name": db_user.full_name, "email": db_user.email, "access_role": db_user.role, "token": platform_token}
        encoded = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()
        # Keep the session credential out of HTTP request logs and Referer headers.
        response = RedirectResponse(url=f"/#entra_session={encoded}")
    except (HTTPException, httpx.HTTPError, KeyError, ValueError, SQLAlchemyError) as exc:
        session.rollback()
        _log.warning("Entra authentication failed error_type=%s", type(exc).__name__)
        detail = exc.detail if isinstance(exc, HTTPException) else "Entra ID authentication failed"
        response = RedirectResponse(url=f"/#entra_error={urllib.parse.quote(str(detail))}")
    response.delete_cookie(_OIDC_COOKIE, path="/api/v1/auth/entra")
    return response
