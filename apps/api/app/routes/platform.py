"""Platform endpoints: CI/CD API tokens, global settings, and data retention."""

import hashlib
import json
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.audit import log_event
from app.auth import require_platform_auth, require_role
from app.db import get_session
from app.models import PlatformApiToken, PlatformSetting, Project, TokenProjectAccess

router = APIRouter(prefix="/api/v1/platform", tags=["platform"])


class TokenGenerateRequest(BaseModel):
    """Request body to generate or rotate the CI/CD platform token."""
    token_name: str
    ttl_days: int | None = Field(default=None, ge=1, le=3650)
    require_current_token: bool = False
    project_keys: list[str] = Field(default_factory=list)
    scopes: list[str] = Field(default_factory=lambda: ["analysis:read", "analysis:write", "integration:write"])


class TokenAccessRequest(BaseModel):
    project_keys: list[str] = Field(min_length=1)
    scopes: list[str] = Field(min_length=1)


DEFAULT_SETTINGS = {
    "instance_name": "CodeInsights",
    "report_max_size_mb": "450",
    "global_source_exclusions": "**/__tests__/**,**/*.snap",
    "source_file_exclusions": "**/*.generated.*,**/coverage/**",
    # Analyses retention
    "retention_keep_days": "90",
    "retention_keep_failed_days": "30",
    "retention_max_per_branch": "50",
    "retention_auto_cleanup": "true",
    "retention_protected_branches": "master,main,develop",
    # Audit log retention (compliance default: 1 year)
    "audit_log_retention_days": "365",
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
    audit_log_retention_days: str = "365"


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
    audit_log_retention_days: str | None = None


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/token/generate")
async def generate_token(
    request: TokenGenerateRequest,
    current_platform_token: str | None = Header(None, alias="X-Current-Platform-Token"),
    session: Session = Depends(get_session),
    auth: dict = Depends(require_role("admin")),
) -> dict:
    """Generate a new CI/CD token, or rotate the current one."""
    if request.require_current_token:
        if not current_platform_token:
            raise HTTPException(status_code=401, detail="Current token is required to rotate")
        presented_hash = _hash_token(current_platform_token)
        current = session.query(PlatformApiToken).filter(
            PlatformApiToken.token_hash == presented_hash,
            PlatformApiToken.is_current.is_(True),
            PlatformApiToken.revoked.is_(False),
        ).first()
        if not current:
            raise HTTPException(status_code=401, detail="Invalid current token")

    allowed_scopes = {"analysis:read", "analysis:write", "integration:write"}
    requested_scopes = set(request.scopes)
    if not request.project_keys:
        raise HTTPException(status_code=422, detail="At least one project must be assigned to a CI token")
    if not requested_scopes or not requested_scopes.issubset(allowed_scopes):
        raise HTTPException(status_code=422, detail="Invalid CI token scope")
    project_keys = set(request.project_keys)
    existing_projects = {row[0] for row in session.query(Project.key).filter(Project.key.in_(project_keys)).all()}
    if existing_projects != project_keys:
        raise HTTPException(status_code=422, detail="Unknown project in CI token assignment")

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
        scopes=json.dumps(sorted(requested_scopes)),
    )
    session.add(token)
    for project_key in sorted(project_keys):
        session.add(TokenProjectAccess(token_id=token.token_id, project_key=project_key))
    log_event(session, auth["email"], auth["role"], "token.generate", "api_token",
              resource_id=token.token_id, resource_label=token.token_name,
              details={"preview": token.token_preview, "expires_at": expires_at.isoformat() if expires_at else None,
                       "project_keys": sorted(project_keys), "scopes": sorted(requested_scopes)})
    session.commit()

    return {
        "token": plaintext,
        "generated_at": now.isoformat(),
        "expires_at": expires_at.isoformat() if expires_at else None,
    }


@router.post("/token/{token_id}/revoke")
async def revoke_token(
    token_id: str,
    session: Session = Depends(get_session),
    auth: dict = Depends(require_role("admin")),
) -> dict:
    token = session.get(PlatformApiToken, token_id)
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")
    token.revoked = True
    token.is_current = False
    log_event(session, auth["email"], auth["role"], "token.revoke", "api_token",
              resource_id=token.token_id, resource_label=token.token_name)
    session.commit()
    return {"token_id": token_id, "revoked": True}


@router.put("/token/{token_id}/access")
async def replace_token_access(
    token_id: str,
    request: TokenAccessRequest,
    session: Session = Depends(get_session),
    auth: dict = Depends(require_role("admin")),
) -> dict:
    token = session.get(PlatformApiToken, token_id)
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")
    allowed_scopes = {"analysis:read", "analysis:write", "integration:write"}
    project_keys, scopes = set(request.project_keys), set(request.scopes)
    known_projects = {row[0] for row in session.query(Project.key).filter(Project.key.in_(project_keys)).all()}
    if known_projects != project_keys or not scopes.issubset(allowed_scopes):
        raise HTTPException(status_code=422, detail="Unknown project or invalid CI token scope")
    session.query(TokenProjectAccess).filter(TokenProjectAccess.token_id == token_id).delete()
    for project_key in sorted(project_keys):
        session.add(TokenProjectAccess(token_id=token_id, project_key=project_key))
    token.scopes = json.dumps(sorted(scopes))
    log_event(session, auth["email"], auth["role"], "token.access.replace", "api_token",
              resource_id=token_id, resource_label=token.token_name,
              details={"project_keys": sorted(project_keys), "scopes": sorted(scopes)})
    session.commit()
    return {"token_id": token_id, "project_keys": sorted(project_keys), "scopes": sorted(scopes)}


@router.get("/token/status")
async def get_token_status(
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> dict:
    """Return whether a current CI/CD token exists and its expiry state."""
    current = session.query(PlatformApiToken).filter(
        PlatformApiToken.is_current.is_(True),
        PlatformApiToken.revoked.is_(False),
    ).all()

    if not current:
        return {"configured": False, "expired": False, "expires_at": None}

    # Column is TIMESTAMP WITHOUT TIME ZONE: Postgres returns naive UTC values.
    now = datetime.utcnow()
    valid = [token for token in current if not token.expires_at or token.expires_at >= now]
    expirations = sorted(token.expires_at for token in valid if token.expires_at)
    return {
        "configured": True,
        "expired": not valid,
        "expires_at": expirations[0].isoformat() if expirations else None,
        "active_token_count": len(valid),
    }


@router.get("/token/history")
async def get_token_history(
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> list:
    """Return the CI/CD token generation history (never the plaintext or hash)."""
    tokens = session.query(PlatformApiToken).order_by(PlatformApiToken.created_at.desc()).all()
    project_rows = session.query(TokenProjectAccess).all()
    projects_by_token: dict[str, list[str]] = {}
    for access in project_rows:
        projects_by_token.setdefault(access.token_id, []).append(access.project_key)
    return [
        {
            "token_id": token.token_id,
            "token_name": token.token_name,
            "token_preview": token.token_preview,
            "created_at": token.created_at.isoformat(),
            "expires_at": token.expires_at.isoformat() if token.expires_at else "",
            "is_current": token.is_current,
            "revoked": token.revoked,
            "scopes": json.loads(token.scopes or "[]"),
            "project_keys": sorted(projects_by_token.get(token.token_id, [])),
        }
        for token in tokens
    ]


@router.get("/settings", response_model=PlatformSettingsResponse)
async def get_settings(
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> PlatformSettingsResponse:
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
    auth: dict = Depends(require_role("admin")),
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
    if updates:
        log_event(session, auth["email"], auth["role"], "settings.update", "platform_settings",
                  details=updates)
    session.commit()
    return await get_settings(_=auth, session=session)


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

    # Audit log retention
    audit_keep_days = max(30, int(_get_setting(session, "audit_log_retention_days", "365")))
    audit_cutoff = (now - timedelta(days=audit_keep_days)).isoformat()
    deleted_audit = session.execute(
        text("DELETE FROM audit_logs WHERE created_at < :cutoff"),
        {"cutoff": audit_cutoff},
    ).rowcount
    session.commit()

    _set_setting(session, "last_cleanup_at", now.isoformat())
    _set_setting(session, "last_cleanup_deleted", str(deleted))
    session.commit()

    return {
        "deleted_analyses": deleted,
        "deleted_audit_logs": deleted_audit,
        "cleanup_at": now.isoformat(),
        "settings_applied": {
            "keep_days": keep_days,
            "keep_failed_days": keep_failed_days,
            "max_per_branch": max_per_branch,
            "audit_log_retention_days": audit_keep_days,
        },
    }


@router.post("/cleanup")
async def trigger_cleanup(
    session: Session = Depends(get_session),
    auth: dict = Depends(require_role("admin")),
) -> dict:
    """Manually trigger a data retention cleanup."""
    result = run_retention_cleanup(session)
    log_event(session, auth["email"], auth["role"], "data.cleanup", "analysis_records",
              details={"deleted_analyses": result["deleted_analyses"]})
    session.commit()
    return result


@router.get("/cleanup/status")
async def get_cleanup_status(
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> dict:
    """Return last cleanup date and number of deleted analyses."""
    return {
        "last_cleanup_at": _get_setting(session, "last_cleanup_at", ""),
        "last_cleanup_deleted": int(_get_setting(session, "last_cleanup_deleted", "0") or "0"),
    }
