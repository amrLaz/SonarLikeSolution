"""Platform endpoints: CI/CD API tokens, global settings, and data retention."""

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import require_platform_auth, require_role
from app.db import get_session
from app.models import PlatformApiToken, PlatformSetting

router = APIRouter(prefix="/api/v1/platform", tags=["platform"])


class TokenGenerateRequest(BaseModel):
    """Request body to generate or rotate the CI/CD platform token."""
    token_name: str
    ttl_days: int | None = None
    require_current_token: bool = False


DEFAULT_SETTINGS = {
    "instance_name": "Upcoop SonarLike Platform",
    "report_max_size_mb": "450",
    "global_source_exclusions": "**/__tests__/**,**/*.snap",
    "source_file_exclusions": "**/*.generated.*,**/coverage/**",
    # Retention
    "retention_keep_days": "90",
    "retention_keep_failed_days": "30",
    "retention_max_per_branch": "50",
    "retention_auto_cleanup": "true",
    "retention_protected_branches": "master,main,develop",
}


class PlatformSettingsResponse(BaseModel):
    instance_name: str
    report_max_size_mb: str
    global_source_exclusions: str
    source_file_exclusions: str
    retention_keep_days: str = "90"
    retention_keep_failed_days: str = "30"
    retention_max_per_branch: str = "50"
    retention_auto_cleanup: str = "true"
    retention_protected_branches: str = "master,main,develop"


class PlatformSettingsUpdateRequest(BaseModel):
    instance_name: str | None = None
    report_max_size_mb: str | None = None
    global_source_exclusions: str | None = None
    source_file_exclusions: str | None = None
    retention_keep_days: str | None = None
    retention_keep_failed_days: str | None = None
    retention_max_per_branch: str | None = None
    retention_auto_cleanup: str | None = None
    retention_protected_branches: str | None = None


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/token/generate")
async def generate_token(
    request: TokenGenerateRequest,
    authorization: str | None = Header(None),
    session: Session = Depends(get_session),
    auth=Depends(require_role("admin")),
) -> dict:
    """Generate a new CI/CD token, or rotate the current one."""
    if request.require_current_token:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Current token is required to rotate")
        presented_hash = _hash_token(authorization.removeprefix("Bearer ").strip())
        current = session.query(PlatformApiToken).filter(
            PlatformApiToken.is_current.is_(True),
            PlatformApiToken.revoked.is_(False),
        ).first()
        if not current or current.token_hash != presented_hash:
            raise HTTPException(status_code=401, detail="Invalid current token")

    session.query(PlatformApiToken).filter(
        PlatformApiToken.is_current.is_(True)
    ).update({"is_current": False})

    plaintext = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=request.ttl_days) if request.ttl_days else None

    token = PlatformApiToken(
        token_id=str(uuid.uuid4()),
        token_name=request.token_name or "CI/CD token",
        token_hash=_hash_token(plaintext),
        token_preview=f"...{plaintext[-4:]}",
        is_current=True,
        revoked=False,
        created_at=now,
        expires_at=expires_at,
    )
    session.add(token)
    session.commit()

    return {
        "token": plaintext,
        "generated_at": now.isoformat(),
        "expires_at": expires_at.isoformat() if expires_at else None,
    }


@router.get("/token/status")
async def get_token_status(session: Session = Depends(get_session)) -> dict:
    """Return whether a current CI/CD token exists and its expiry state."""
    current = session.query(PlatformApiToken).filter(
        PlatformApiToken.is_current.is_(True),
        PlatformApiToken.revoked.is_(False),
    ).first()

    if not current:
        return {"configured": False, "expired": False, "expires_at": None}

    # Column is TIMESTAMP WITHOUT TIME ZONE: Postgres returns naive UTC values.
    expired = bool(current.expires_at and current.expires_at < datetime.utcnow())
    return {
        "configured": True,
        "expired": expired,
        "expires_at": current.expires_at.isoformat() if current.expires_at else None,
    }


@router.get("/token/history")
async def get_token_history(session: Session = Depends(get_session)) -> list:
    """Return the CI/CD token generation history (never the plaintext or hash)."""
    tokens = session.query(PlatformApiToken).order_by(PlatformApiToken.created_at.desc()).all()
    return [
        {
            "token_id": token.token_id,
            "token_name": token.token_name,
            "token_preview": token.token_preview,
            "created_at": token.created_at.isoformat(),
            "expires_at": token.expires_at.isoformat() if token.expires_at else "",
            "is_current": token.is_current,
        }
        for token in tokens
    ]


@router.get("/settings", response_model=PlatformSettingsResponse)
async def get_settings(session: Session = Depends(get_session)) -> PlatformSettingsResponse:
    """Return global platform settings, falling back to defaults for unset keys."""
    rows = session.query(PlatformSetting).filter(
        PlatformSetting.key.in_(DEFAULT_SETTINGS.keys())
    ).all()
    values = dict(DEFAULT_SETTINGS)
    for row in rows:
        values[row.key] = row.value
    return PlatformSettingsResponse(**values)


@router.put("/settings", response_model=PlatformSettingsResponse)
async def update_settings(
    request: PlatformSettingsUpdateRequest,
    session: Session = Depends(get_session),
    auth=Depends(require_role("admin")),
) -> PlatformSettingsResponse:
    """Upsert global platform settings into the platform_settings table."""
    updates = request.model_dump(exclude_none=True)
    for key, value in updates.items():
        row = session.query(PlatformSetting).filter(PlatformSetting.key == key).first()
        if row:
            row.value = value
            row.updated_at = datetime.now(timezone.utc)
        else:
            session.add(PlatformSetting(
                id=str(uuid.uuid4()),
                key=key,
                value=value,
            ))
    session.commit()
    return await get_settings(session=session)


# ── Data retention ─────────────────────────────────────────────────────────────

def _get_setting(session: Session, key: str, default: str = "") -> str:
    row = session.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    return row.value if row else default


def _set_setting(session: Session, key: str, value: str) -> None:
    row = session.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    if row:
        row.value = value
    else:
        session.add(PlatformSetting(id=str(uuid.uuid4()), key=key, value=value))


def run_retention_cleanup(session: Session) -> dict:
    """
    Delete old analysis records according to platform retention settings.
    Rules (applied in order):
      1. Failed analyses older than retention_keep_failed_days
      2. Feature-branch completed analyses older than retention_keep_days
      3. Per (project, branch): keep only the most recent retention_max_per_branch runs
    Always preserves the single most recent analysis per (project, branch).
    """
    keep_days = max(1, int(_get_setting(session, "retention_keep_days", "90")))
    keep_failed_days = max(1, int(_get_setting(session, "retention_keep_failed_days", "30")))
    max_per_branch = max(1, int(_get_setting(session, "retention_max_per_branch", "50")))

    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=keep_days)).isoformat()
    failed_cutoff = (now - timedelta(days=keep_failed_days)).isoformat()
    deleted = 0

    def _delete_ids(ids: list[str]) -> int:
        if not ids:
            return 0
        placeholders = "(" + ",".join(f"'{i}'" for i in ids) + ")"
        session.execute(text(f"DELETE FROM analysis_iocs WHERE analysis_id IN {placeholders}"))
        session.execute(text(f"DELETE FROM analysis_vulnerabilities WHERE analysis_id IN {placeholders}"))
        session.execute(text(f"DELETE FROM vulnerability_scans WHERE analysis_id IN {placeholders}"))
        r = session.execute(text(f"DELETE FROM analysis_records WHERE analysis_id IN {placeholders}"))
        return r.rowcount

    # Rule 1: old failed analyses
    rows = session.execute(text(
        "SELECT analysis_id FROM analysis_records WHERE status = 'failed' AND created_at < :cutoff"
    ), {"cutoff": failed_cutoff}).fetchall()
    deleted += _delete_ids([r[0] for r in rows])

    # Rule 2: old feature-branch analyses (spare main branches)
    protected = _get_setting(session, "retention_protected_branches", "master,main,develop")
    protected_list = "(" + ",".join(f"'{b.strip()}'" for b in protected.split(",") if b.strip()) + ")"
    rows = session.execute(text(
        f"SELECT analysis_id FROM analysis_records "
        f"WHERE branch NOT IN {protected_list} AND created_at < :cutoff"
    ), {"cutoff": cutoff}).fetchall()
    deleted += _delete_ids([r[0] for r in rows])

    # Rule 3: per (project_key, branch) keep only the N most recent
    combos = session.execute(text(
        "SELECT project_key, branch, COUNT(*) AS cnt FROM analysis_records "
        "GROUP BY project_key, branch HAVING COUNT(*) > :max"
    ), {"max": max_per_branch}).fetchall()

    for project_key, branch, _cnt in combos:
        keep_rows = session.execute(text(
            "SELECT analysis_id FROM analysis_records "
            "WHERE project_key = :pk AND branch = :br "
            "ORDER BY created_at DESC LIMIT :lim"
        ), {"pk": project_key, "br": branch, "lim": max_per_branch}).fetchall()
        keep_ids = {r[0] for r in keep_rows}

        all_rows = session.execute(text(
            "SELECT analysis_id FROM analysis_records "
            "WHERE project_key = :pk AND branch = :br"
        ), {"pk": project_key, "br": branch}).fetchall()
        to_delete = [r[0] for r in all_rows if r[0] not in keep_ids]
        deleted += _delete_ids(to_delete)

    session.commit()

    _set_setting(session, "last_cleanup_at", now.isoformat())
    _set_setting(session, "last_cleanup_deleted", str(deleted))
    session.commit()

    return {
        "deleted_analyses": deleted,
        "cleanup_at": now.isoformat(),
        "settings_applied": {
            "keep_days": keep_days,
            "keep_failed_days": keep_failed_days,
            "max_per_branch": max_per_branch,
        },
    }


@router.post("/cleanup")
async def trigger_cleanup(
    session: Session = Depends(get_session),
    auth=Depends(require_role("admin")),
) -> dict:
    """Manually trigger a data retention cleanup."""
    return run_retention_cleanup(session)


@router.get("/cleanup/status")
async def get_cleanup_status(session: Session = Depends(get_session)) -> dict:
    """Return last cleanup date and number of deleted analyses."""
    return {
        "last_cleanup_at": _get_setting(session, "last_cleanup_at", ""),
        "last_cleanup_deleted": int(_get_setting(session, "last_cleanup_deleted", "0") or "0"),
    }
