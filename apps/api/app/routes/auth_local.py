"""Local authentication — email/password sign-in and user self-service."""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import hash_password, require_role, sign_session_token, verify_password
from app.db import get_session
from app.models import PlatformUser

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
    session.commit()
    return {"user_id": user.user_id, "email": user.email, "role": user.role}


class UpdateUserRequest(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    full_name: Optional[str] = None


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

    if request.role is not None:
        if request.role not in ("admin", "regular", "default"):
            raise HTTPException(status_code=422, detail="Invalid role")
        user.role = request.role
    if request.is_active is not None:
        user.is_active = request.is_active
    if request.full_name is not None:
        user.full_name = request.full_name.strip()

    session.commit()
    return {"user_id": user.user_id, "role": user.role, "is_active": user.is_active}
