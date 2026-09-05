"""Local authentication — email/password sign-in and user self-service."""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.audit import log_event
from app.auth import effective_permissions, hash_password, require_role, sign_session_token, verify_password
from app.db import get_session
from app.models import Organization, PlatformUser, Project, UserGrant

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


def _user_payload(user: PlatformUser) -> dict:
    return {
        "sub": user.user_id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
    }


@router.post("/login")
def login(
    request: LoginRequest,
    session: Session = Depends(get_session),
) -> dict:
    """Authenticate with email + password. Returns a signed session token."""
    email = request.email.strip().lower()
    user = session.query(PlatformUser).filter(
        PlatformUser.email == email,
        PlatformUser.auth_provider == "local",
        PlatformUser.is_active.is_(True),
    ).first()

    if not user or not user.hashed_password:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(request.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user.last_login_at = datetime.now(timezone.utc)
    log_event(session, user.email, user.role, "user.login", "session",
              resource_label=user.email, details={"provider": "local"})
    session.commit()

    token = sign_session_token(_user_payload(user), session)
    return {
        "token": token,
        "user": {
            "user_id": user.user_id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
        },
    }


@router.get("/me")
def me(
    payload: dict = Depends(require_role("admin", "regular", "default")),
    session: Session = Depends(get_session),
) -> dict:
    """Return the current user's profile."""
    user = session.query(PlatformUser).filter(
        PlatformUser.user_id == payload.get("sub")
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "user_id": user.user_id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "auth_provider": user.auth_provider,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "permissions": effective_permissions(payload, session),
    }


@router.put("/me/password")
def change_password(
    request: ChangePasswordRequest,
    payload: dict = Depends(require_role("admin", "regular", "default")),
    session: Session = Depends(get_session),
) -> dict:
    """Change the current user's password (local accounts only)."""
    user = session.query(PlatformUser).filter(
        PlatformUser.user_id == payload.get("sub"),
        PlatformUser.auth_provider == "local",
    ).first()
    if not user or not user.hashed_password:
        raise HTTPException(status_code=400, detail="Password change not available for SSO accounts")

    if not verify_password(request.current_password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    if len(request.new_password) < 8:
        raise HTTPException(status_code=422, detail="New password must be at least 8 characters")

    user.hashed_password = hash_password(request.new_password)
    session.commit()
    return {"status": "password updated"}


# ── Admin: list / create / update platform users ──────────────────────────────

@router.get("/users")
def list_users(
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> list[dict]:
    users = session.query(PlatformUser).order_by(PlatformUser.created_at).all()
    grants = session.query(UserGrant).all()
    by_user: dict[str, list[dict]] = {}
    for grant in grants:
        by_user.setdefault(grant.user_id, []).append({"scope_type": grant.scope_type, "scope_id": grant.scope_id})
    return [
        {
            "user_id": u.user_id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "auth_provider": u.auth_provider,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat(),
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            "grants": by_user.get(u.user_id, []),
        }
        for u in users
    ]


class CreateUserRequest(BaseModel):
    email: str
    full_name: str
    role: str = "default"
    password: Optional[str] = None


@router.post("/users")
def create_user(
    request: CreateUserRequest,
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> dict:
    email = request.email.strip().lower()
    if session.query(PlatformUser).filter(PlatformUser.email == email).first():
        raise HTTPException(status_code=409, detail="A user with this email already exists")

    if request.role not in ("admin", "regular", "default"):
        raise HTTPException(status_code=422, detail="Role must be admin, regular, or default")

    hashed = None
    if request.password:
        if len(request.password) < 8:
            raise HTTPException(status_code=422, detail="Password must be at least 8 characters")
        hashed = hash_password(request.password)

    user = PlatformUser(
        user_id=str(uuid.uuid4()),
        email=email,
        full_name=request.full_name.strip(),
        role=request.role,
        hashed_password=hashed,
        auth_provider="local",
        is_active=True,
    )
    session.add(user)
    log_event(session, _["email"], _["role"], "user.create", "user",
              resource_id=user.user_id, resource_label=email,
              details={"role": request.role})
    session.commit()
    return {"user_id": user.user_id, "email": user.email, "role": user.role}


class UpdateUserRequest(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    full_name: Optional[str] = None


class UserGrantsRequest(BaseModel):
    organization_ids: list[str] = Field(default_factory=list)
    project_keys: list[str] = Field(default_factory=list)


@router.put("/users/{user_id}/grants")
def replace_user_grants(
    user_id: str,
    request: UserGrantsRequest,
    caller: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> dict:
    user = session.get(PlatformUser, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    organization_ids = set(request.organization_ids)
    project_keys = set(request.project_keys)
    known_organizations = {row[0] for row in session.query(Organization.id).filter(Organization.id.in_(organization_ids)).all()} if organization_ids else set()
    known_projects = {row[0] for row in session.query(Project.key).filter(Project.key.in_(project_keys)).all()} if project_keys else set()
    if known_organizations != organization_ids or known_projects != project_keys:
        raise HTTPException(status_code=422, detail="Unknown organization or project in grants")
    session.query(UserGrant).filter(UserGrant.user_id == user_id).delete()
    for scope_type, values in (("organization", known_organizations), ("project", known_projects)):
        for scope_id in sorted(values):
            session.add(UserGrant(id=str(uuid.uuid4()), user_id=user_id, scope_type=scope_type, scope_id=scope_id))
    log_event(session, caller["email"], caller["role"], "user.grants.replace", "user",
              resource_id=user_id, resource_label=user.email,
              details={"organization_ids": sorted(known_organizations), "project_keys": sorted(known_projects)})
    session.commit()
    return {"user_id": user_id, "organization_ids": sorted(known_organizations), "project_keys": sorted(known_projects)}


@router.put("/users/{user_id}")
def update_user(
    user_id: str,
    request: UpdateUserRequest,
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> dict:
    user = session.query(PlatformUser).filter(PlatformUser.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    changes: dict = {}
    if request.role is not None:
        if request.role not in ("admin", "regular", "default"):
            raise HTTPException(status_code=422, detail="Invalid role")
        changes["role"] = {"from": user.role, "to": request.role}
        user.role = request.role
    if request.is_active is not None:
        changes["is_active"] = {"from": user.is_active, "to": request.is_active}
        user.is_active = request.is_active
    if request.full_name is not None:
        user.full_name = request.full_name.strip()

    if changes:
        action = "user.role.change" if "role" in changes else "user.status.change"
        log_event(session, _["email"], _["role"], action, "user",
                  resource_id=user.user_id, resource_label=user.email, details=changes)
    session.commit()
    return {"user_id": user.user_id, "role": user.role, "is_active": user.is_active}


class AdminPasswordResetRequest(BaseModel):
    new_password: str


@router.put("/users/{user_id}/password")
def admin_reset_password(
    user_id: str,
    request: AdminPasswordResetRequest,
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> dict:
    """Admin resets any user's password."""
    user = session.query(PlatformUser).filter(PlatformUser.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if len(request.new_password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")
    user.hashed_password = hash_password(request.new_password)
    user.auth_provider = "local"
    log_event(session, _["email"], _["role"], "user.password.reset", "user",
              resource_id=user.user_id, resource_label=user.email)
    session.commit()
    return {"status": "password updated"}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    caller: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> dict:
    """Delete a platform user (cannot delete yourself)."""
    if caller.get("sub") == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    user = session.query(PlatformUser).filter(PlatformUser.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    log_event(session, caller["email"], caller["role"], "user.delete", "user",
              resource_id=user.user_id, resource_label=user.email,
              details={"had_role": user.role, "auth_provider": user.auth_provider})
    session.query(UserGrant).filter(UserGrant.user_id == user_id).delete()
    session.delete(user)
    session.commit()
    return {"status": "deleted"}
