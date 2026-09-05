"""P0 authentication checks; no API startup or database connection."""

import asyncio
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import Mock

import pytest
import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))

from app import auth, db
from app.routes import auth_entra
from app.models import AuthProviderConfig, Base, OidcTransaction, Organization, PlatformApiToken, PlatformUser, Project, TokenProjectAccess, UserGrant


@pytest.fixture
def access_session():
    """Exercise authorization SQL against in-memory data, never application startup."""
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        session.add_all([
            Organization(id="org-a", key="org-a", name="A"),
            Organization(id="org-b", key="org-b", name="B"),
            Project(id="a", key="project-a", name="A", organization_id="org-a"),
            Project(id="a2", key="project-a2", name="A2", organization_id="org-a"),
            Project(id="b", key="project-b", name="B", organization_id="org-b"),
            PlatformUser(user_id="alice", email="alice@example.invalid", full_name="Alice", role="regular"),
        ])
        session.commit()
        yield session
    engine.dispose()


@pytest.mark.parametrize("scope_type,scope_id,expected", [
    ("project", "project-a", {"project-a"}),
    ("organization", "org-a", {"project-a", "project-a2"}),
])
def test_user_grants_do_not_leak_other_organizations(access_session, scope_type, scope_id, expected):
    principal = {"kind": "user", "sub": "alice", "role": "regular"}
    assert not auth.allowed_project_keys(principal, access_session)
    access_session.add(UserGrant(id="grant", user_id="alice", scope_type=scope_type, scope_id=scope_id))
    access_session.commit()
    assert set(auth.allowed_project_keys(principal, access_session)) == expected
    auth.assert_project_access(principal, access_session, "project-a")
    with pytest.raises(HTTPException) as exc:
        auth.assert_project_access(principal, access_session, "project-b")
    assert exc.value.status_code in {403, 404}
    access_session.query(UserGrant).delete()
    access_session.commit()
    assert not auth.allowed_project_keys(principal, access_session)


def test_ci_requires_both_project_and_permission(access_session):
    principal = {"kind": "ci", "token_id": "ci-a", "scopes": ["analysis:write"]}
    access_session.add(TokenProjectAccess(token_id="ci-a", project_key="project-a"))
    access_session.commit()
    assert auth.allowed_project_keys(principal, access_session) == set()
    assert auth.allowed_project_keys(principal, access_session, "analysis:write") == {"project-a"}
    with pytest.raises(HTTPException):
        auth.assert_ci_permission(principal)
    auth.assert_ci_permission(principal, "analysis:write")
    auth.assert_project_access(principal, access_session, "project-a", "analysis:write")
    for project, permission in [("project-b", "analysis:write"), ("project-a", "integration:write")]:
        with pytest.raises(HTTPException) as exc:
            auth.assert_project_access(principal, access_session, project, permission)
        assert exc.value.status_code in {403, 404}


def test_session_signature_and_expiration(monkeypatch):
    monkeypatch.setattr(auth, "_get_secret", lambda session: "test-only-signing-secret")
    monkeypatch.setattr(auth.time, "time", lambda: 1000)
    token = auth.sign_session_token({"sub": "alice", "role": "regular"}, Mock())
    assert auth.verify_session_token(token, Mock())["sub"] == "alice"
    header, signature = token.split(".")
    replacement = "0" if signature[0] != "0" else "1"
    assert auth.verify_session_token(f"{header}.{replacement}{signature[1:]}", Mock()) is None
    monkeypatch.setattr(auth.time, "time", lambda: 1000 + 86400 * 30 + 1)
    assert auth.verify_session_token(token, Mock()) is None


@pytest.mark.parametrize("token", ["", "garbage", "a.b.c", "e30.invalid-signature"])
def test_malformed_session_rejected(token, monkeypatch):
    monkeypatch.setattr(auth, "_get_secret", lambda session: "test-only-signing-secret")
    assert auth.verify_session_token(token, Mock()) is None


@pytest.mark.parametrize("authorization", [None, "", "Basic abc", "Bearer "])
def test_role_requires_valid_identity(authorization, monkeypatch):
    monkeypatch.setattr(auth, "verify_session_token", lambda token, session: None)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth.require_role("admin")(authorization=authorization, session=Mock()))
    assert exc.value.status_code == 401


def test_regular_user_cannot_administer(monkeypatch, access_session):
    monkeypatch.setattr(auth, "verify_session_token", lambda token, session: {"sub": "alice", "role": "regular"})
    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth.require_role("admin")(authorization="Bearer test", session=access_session))
    assert exc.value.status_code == 403


def test_user_disable_and_role_change_apply_to_existing_session(monkeypatch, access_session):
    monkeypatch.setattr(auth, "verify_session_token", lambda token, session: {"sub": "alice", "role": "admin"})
    principal = asyncio.run(auth.require_user_auth(authorization="Bearer test", session=access_session))
    assert principal["role"] == "regular"
    access_session.get(PlatformUser, "alice").is_active = False
    access_session.commit()
    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth.require_user_auth(authorization="Bearer test", session=access_session))
    assert exc.value.status_code == 401


@pytest.mark.parametrize("revoked,current,days,accepted", [
    (False, True, 1, True),
    (True, True, 1, False),
    (False, False, 1, False),
    (False, True, -1, False),
])
def test_ci_expiration_revocation_and_rotation(access_session, revoked, current, days, accepted):
    access_session.add(PlatformApiToken(
        token_id="token", token_name="Test", token_hash=hashlib.sha256(b"test-ci-token").hexdigest(),
        token_preview="test", revoked=revoked, is_current=current,
        expires_at=datetime.now(timezone.utc) + timedelta(days=days), scopes='["analysis:write"]',
    ))
    access_session.commit()
    if accepted:
        principal = asyncio.run(auth.require_ci_token_auth(authorization="Bearer test-ci-token", session=access_session))
        assert principal["token_id"] == "token"
        assert principal["scopes"] == ["analysis:write"]
    else:
        with pytest.raises(HTTPException) as exc:
            asyncio.run(auth.require_ci_token_auth(authorization="Bearer test-ci-token", session=access_session))
        assert exc.value.status_code == 401


def test_password_hash_rejects_wrong_password():
    hashed = auth.hash_password("correct test password")
    assert auth.verify_password("correct test password", hashed)
    assert not auth.verify_password("incorrect test password", hashed)
    assert not auth.verify_password("correct test password", "invalid hash")


def test_bootstrap_secret_never_reactivates_or_resets_existing_admin(monkeypatch):
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    monkeypatch.setattr(db, "SessionLocal", lambda: Session(engine))
    monkeypatch.setenv("PLATFORM_ADMIN_EMAIL", "admin@example.invalid")
    monkeypatch.setenv("PLATFORM_ADMIN_PASSWORD", "initial-password")

    db._seed_default_admin()
    with Session(engine) as session:
        admin = session.query(PlatformUser).one()
        original_hash = admin.hashed_password
        admin.is_active = False
        session.commit()

    monkeypatch.setenv("PLATFORM_ADMIN_PASSWORD", "replacement-password")
    db._seed_default_admin()
    with Session(engine) as session:
        admin = session.query(PlatformUser).one()
        assert admin.is_active is False
        assert admin.hashed_password == original_hash
        assert auth.verify_password("initial-password", admin.hashed_password)
    engine.dispose()


def test_strict_mapping_ignores_expired_ci_tokens(monkeypatch):
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        session.add(Organization(id="org", key="org", name="Organization"))
        session.add(Project(
            id="project", key="project", name="Project", organization_id="org",
            analysis_profile_id="p0-dotnet", analysis_profile_version="1",
        ))
        session.add(PlatformApiToken(
            token_id="expired", token_name="Expired", token_hash="hash", token_preview="hash",
            revoked=False, is_current=True, expires_at=datetime.now(timezone.utc) - timedelta(days=1),
            scopes="[]",
        ))
        session.commit()
    monkeypatch.setattr(db, "SessionLocal", lambda: Session(engine))
    db._validate_p0_mappings()
    engine.dispose()


@pytest.mark.parametrize("state", [None, "unissued-state"])
def test_entra_rejects_callback_without_matching_browser_transaction(state, monkeypatch):
    """Invalid state must stop before code exchange, even with valid provider config."""
    application = FastAPI()
    application.include_router(auth_entra.router)
    application.dependency_overrides[auth_entra.get_session] = lambda: Mock()
    monkeypatch.setattr(auth_entra, "_load_azure_ad_config", lambda session: {
        "tenant_id": "test-tenant", "client_id": "test-client",
        "client_secret": "test-only-secret", "redirect_uri": "https://test.invalid/callback",
    })

    def forbidden_exchange(*args, **kwargs):
        pytest.fail("Unvalidated state reached the OIDC token exchange")

    monkeypatch.setattr(auth_entra.httpx, "AsyncClient", forbidden_exchange)
    params = {"code": "untrusted-code"}
    if state is not None:
        params["state"] = state
    response = TestClient(application).get(
        "/api/v1/auth/entra/callback", params=params, follow_redirects=False,
    )
    assert response.status_code in {400, 401, 403, 302, 303, 307}
    if response.is_redirect:
        assert "entra_error=" in response.headers["location"]
        assert "entra_session=" not in response.headers["location"]


def test_entra_transaction_is_bound_to_browser_and_single_use(access_session):
    transaction = OidcTransaction(
        state_hash=auth_entra._hash("state"), cookie_hash=auth_entra._hash("browser"),
        nonce="nonce", expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
    )
    access_session.add(transaction)
    access_session.commit()
    with pytest.raises(HTTPException):
        auth_entra._consume_transaction(access_session, "state", "different-browser")
    assert transaction.used_at is None
    assert auth_entra._consume_transaction(access_session, "state", "browser").nonce == "nonce"
    with pytest.raises(HTTPException):
        auth_entra._consume_transaction(access_session, "state", "browser")


def test_entra_transaction_expiration(access_session):
    access_session.add(OidcTransaction(
        state_hash=auth_entra._hash("expired"), cookie_hash=auth_entra._hash("browser"),
        nonce="nonce", expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
    ))
    access_session.commit()
    with pytest.raises(HTTPException):
        auth_entra._consume_transaction(access_session, "expired", "browser")


@pytest.mark.parametrize("override", [
    {}, {"iss": "https://other.invalid"}, {"tid": "other-tenant"}, {"aud": "other-client"},
    {"nonce": "other-nonce"}, {"exp": 1000}, {"nbf": 1001}, {"oid": ""},
])
def test_entra_claim_validation(monkeypatch, override):
    claims = {
        "iss": "https://login.microsoftonline.com/tenant/v2.0", "tid": "tenant",
        "aud": "client", "nonce": "nonce", "exp": 1100, "nbf": 900, "oid": "object-id",
        **override,
    }
    monkeypatch.setattr(auth_entra, "_verify_rs256_signature", lambda token, jwks: claims)
    args = ("signed-token", {"tenant_id": "tenant", "client_id": "client"}, "nonce", {})
    if not override:
        assert auth_entra._verify_oidc_id_token(*args, now=1000) == claims
    else:
        with pytest.raises(HTTPException) as exc:
            auth_entra._verify_oidc_id_token(*args, now=1000)
        assert exc.value.status_code == 401


@pytest.mark.parametrize("token", ["invalid", "e30.e30.AA", "eyJhbGciOiJub25lIiwia2lkIjoiayJ9.e30.AA"])
def test_entra_rejects_unsigned_or_malformed_tokens(token):
    with pytest.raises(HTTPException) as exc:
        auth_entra._verify_rs256_signature(token, {"keys": []})
    assert exc.value.status_code == 401


def test_entra_valid_signature_and_tampering():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private_key.public_key()))
    jwk.update(kid="test-key", use="sig", alg="RS256")
    claims = {"oid": "alice"}
    token = jwt.encode(claims, private_key, algorithm="RS256", headers={"kid": "test-key"})
    assert auth_entra._verify_rs256_signature(token, {"keys": [jwk]}) == claims
    header, payload, signature = token.split(".")
    forged_payload = auth._b64url_encode(b'{"oid":"admin"}')
    with pytest.raises(HTTPException):
        auth_entra._verify_rs256_signature(f"{header}.{forged_payload}.{signature}", {"keys": [jwk]})
    with pytest.raises(HTTPException):
        auth_entra._verify_rs256_signature(token, {"keys": [{**jwk, "use": "enc"}]})


@pytest.mark.parametrize("uri", [
    "https://quality.example.invalid/callback",
    "http://localhost:5173/callback",
    "http://127.0.0.1:5173/callback",
])
def test_entra_redirect_uri_accepts_https_and_loopback(uri):
    auth_entra.validate_redirect_uri(uri)


@pytest.mark.parametrize("uri", ["http://quality.example.invalid/callback", "ftp://localhost/callback", "callback"])
def test_entra_redirect_uri_rejects_insecure_remote_values(uri):
    with pytest.raises(HTTPException):
        auth_entra.validate_redirect_uri(uri)


class _OidcHttpResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _OidcHttpClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return None

    async def post(self, *_args, **_kwargs):
        return _OidcHttpResponse({"id_token": "signed-id-token"})

    async def get(self, *_args, **_kwargs):
        return _OidcHttpResponse({"keys": []})


def _prepare_oidc_callback(access_session, state: str, browser: str):
    provider = access_session.query(AuthProviderConfig).filter_by(provider_type="azure-ad").first()
    if not provider:
        provider = AuthProviderConfig(
            id="entra-provider", provider_type="azure-ad", name="Entra", enabled=True,
            config=json.dumps({
                "tenant_id": "tenant", "client_id": "client", "client_secret": "test-only",
                "redirect_uri": "https://quality.example.invalid/api/v1/auth/entra/callback",
            }),
        )
        access_session.add(provider)
    access_session.add(OidcTransaction(
        state_hash=auth_entra._hash(state), cookie_hash=auth_entra._hash(browser),
        nonce="nonce", expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
    ))
    access_session.commit()


def test_entra_valid_callback_creates_ungranted_default_user(access_session, monkeypatch):
    _prepare_oidc_callback(access_session, "valid-state", "valid-browser")
    monkeypatch.setattr(auth_entra.httpx, "AsyncClient", lambda **_: _OidcHttpClient())
    monkeypatch.setattr(auth_entra, "_verify_oidc_id_token", lambda *_args, **_kwargs: {
        "tid": "tenant", "oid": "new-object", "email": "new@example.invalid", "name": "New User",
    })
    response = asyncio.run(auth_entra.entra_callback(
        code="code", state="valid-state", quality_hub_oidc="valid-browser", session=access_session,
    ))
    assert response.status_code in {302, 307}
    assert "#entra_session=" in response.headers["location"]
    user = access_session.query(PlatformUser).filter_by(entra_object_id="new-object").one()
    assert user.role == "default"
    assert auth.allowed_project_keys({"kind": "user", "sub": user.user_id, "role": user.role}, access_session) == set()


def test_entra_persistence_error_refuses_session(access_session, monkeypatch):
    _prepare_oidc_callback(access_session, "error-state", "error-browser")
    monkeypatch.setattr(auth_entra.httpx, "AsyncClient", lambda **_: _OidcHttpClient())
    monkeypatch.setattr(auth_entra, "_verify_oidc_id_token", lambda *_args, **_kwargs: {
        "tid": "tenant", "oid": "failing-object", "email": "failure@example.invalid",
    })
    monkeypatch.setattr(auth_entra, "log_event", Mock(side_effect=auth_entra.SQLAlchemyError("write failed")))
    response = asyncio.run(auth_entra.entra_callback(
        code="code", state="error-state", quality_hub_oidc="error-browser", session=access_session,
    ))
    assert "#entra_error=" in response.headers["location"]
    assert "entra_session=" not in response.headers["location"]
    assert access_session.query(PlatformUser).filter_by(entra_object_id="failing-object").first() is None
