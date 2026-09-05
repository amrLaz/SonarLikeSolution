"""Audit log query endpoint — admin-only."""

import json

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import require_role
from app.db import get_session
from app.models import AuditLog

router = APIRouter(prefix="/api/v1/audit-logs", tags=["audit"])


@router.get("")
def list_audit_logs(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    action: str | None = Query(None),
    actor: str | None = Query(None),
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> dict:
    """Return paginated audit log entries, newest first."""
    q = session.query(AuditLog)
    if action:
        q = q.filter(AuditLog.action == action)
    if actor:
        q = q.filter(AuditLog.actor_email.ilike(f"%{actor}%"))
    total = q.count()
    entries = q.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "entries": [
            {
                "id": e.id,
                "actor_email": e.actor_email,
                "actor_role": e.actor_role,
                "action": e.action,
                "resource_type": e.resource_type,
                "resource_id": e.resource_id,
                "resource_label": e.resource_label,
                "details": json.loads(e.details) if e.details else None,
                "created_at": e.created_at.isoformat(),
            }
            for e in entries
        ],
    }


@router.get("/actions")
def list_audit_actions(
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> list[str]:
    """Return the distinct action types that appear in the log."""
    rows = session.query(AuditLog.action).distinct().order_by(AuditLog.action).all()
    return [r[0] for r in rows]
