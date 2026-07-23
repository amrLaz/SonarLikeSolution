"""Audit logging — thin helper used by all routes that mutate platform state."""

import json
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session


def log_event(
    session: Session,
    actor_email: str,
    actor_role: str,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    resource_label: str | None = None,
    details: dict | None = None,
) -> None:
    """Append an audit entry to the current session (caller must commit).

    Never raises — audit failure must never interrupt the main flow.
    """
    from app.models import AuditLog
    try:
        session.add(AuditLog(
            id=str(uuid.uuid4()),
            actor_email=actor_email,
            actor_role=actor_role,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            resource_label=resource_label,
            details=json.dumps(details, default=str) if details else None,
            created_at=datetime.now(timezone.utc),
        ))
    except Exception as exc:
        print(f"[audit] log_event failed (non-fatal): {exc}")
