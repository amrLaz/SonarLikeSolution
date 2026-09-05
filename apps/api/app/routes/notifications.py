"""Notification channel management — admin only."""

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import require_role
from app.db import get_session
from app.models import NotificationChannel
from app.notify import send_test

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


def _to_response(ch: NotificationChannel) -> dict:
    cfg = json.loads(ch.config or "{}")
    # Strip password from response
    safe_cfg = {k: v for k, v in cfg.items() if k != "smtp_password"}
    if "smtp_password" in cfg:
        safe_cfg["smtp_password_set"] = bool(cfg["smtp_password"])
    return {
        "id": ch.id,
        "name": ch.name,
        "channel_type": ch.channel_type,
        "config": safe_cfg,
        "enabled": ch.enabled,
        "on_fail": ch.on_fail,
        "on_pass": ch.on_pass,
        "created_at": ch.created_at.isoformat(),
        "updated_at": ch.updated_at.isoformat(),
    }


@router.get("/channels")
def list_channels(
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> list[dict]:
    channels = session.query(NotificationChannel).order_by(NotificationChannel.created_at).all()
    return [_to_response(ch) for ch in channels]


class ChannelCreateRequest(BaseModel):
    name: str
    channel_type: str           # webhook | email
    config: dict = {}
    on_fail: bool = True
    on_pass: bool = False
    enabled: bool = True


@router.post("/channels")
def create_channel(
    request: ChannelCreateRequest,
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> dict:
    if request.channel_type not in ("webhook", "email"):
        raise HTTPException(status_code=422, detail="channel_type must be 'webhook' or 'email'")
    ch = NotificationChannel(
        id=str(uuid.uuid4()),
        name=request.name.strip(),
        channel_type=request.channel_type,
        config=json.dumps(request.config),
        enabled=request.enabled,
        on_fail=request.on_fail,
        on_pass=request.on_pass,
    )
    session.add(ch)
    session.commit()
    return _to_response(ch)


class ChannelUpdateRequest(BaseModel):
    name: Optional[str] = None
    config: Optional[dict] = None
    enabled: Optional[bool] = None
    on_fail: Optional[bool] = None
    on_pass: Optional[bool] = None


@router.put("/channels/{channel_id}")
def update_channel(
    channel_id: str,
    request: ChannelUpdateRequest,
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> dict:
    ch = session.query(NotificationChannel).filter(NotificationChannel.id == channel_id).first()
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    if request.name is not None:
        ch.name = request.name.strip()
    if request.config is not None:
        existing = json.loads(ch.config or "{}")
        # Never blank-overwrite a stored smtp_password
        if not request.config.get("smtp_password") and existing.get("smtp_password"):
            request.config["smtp_password"] = existing["smtp_password"]
        ch.config = json.dumps({**existing, **request.config})
    if request.enabled is not None:
        ch.enabled = request.enabled
    if request.on_fail is not None:
        ch.on_fail = request.on_fail
    if request.on_pass is not None:
        ch.on_pass = request.on_pass
    ch.updated_at = datetime.now(timezone.utc)
    session.commit()
    return _to_response(ch)


@router.delete("/channels/{channel_id}")
def delete_channel(
    channel_id: str,
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> dict:
    ch = session.query(NotificationChannel).filter(NotificationChannel.id == channel_id).first()
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    session.delete(ch)
    session.commit()
    return {"status": "deleted"}


@router.post("/channels/{channel_id}/test")
def test_channel(
    channel_id: str,
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> dict:
    ch = session.query(NotificationChannel).filter(NotificationChannel.id == channel_id).first()
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    cfg = json.loads(ch.config or "{}")
    result = send_test(ch.channel_type, cfg)
    if result != "ok":
        raise HTTPException(status_code=400, detail=f"Test failed: {result}")
    return {"status": "ok", "message": "Test notification sent successfully"}
