"""CISA Known Exploited Vulnerabilities (KEV) catalog management."""

import json
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import assert_ci_permission, require_platform_auth, require_role
from app.db import get_session

router = APIRouter(prefix="/api/v1/kev", tags=["kev"])

_KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
_KEY_IDS = "kev_catalog_ids"
_KEY_TS = "kev_last_updated"


def get_kev_ids(session: Session) -> set[str]:
    """Return the set of KEV CVE IDs currently cached in DB."""
    from app.models import PlatformSetting
    row = session.query(PlatformSetting).filter(PlatformSetting.key == _KEY_IDS).first()
    if not row:
        return set()
    try:
        return set(json.loads(row.value))
    except Exception:
        return set()


def refresh_kev_catalog(session: Session) -> int:
    """Download CISA KEV and persist CVE IDs. Returns count. Raises on network error."""
    from app.models import PlatformSetting

    with urllib.request.urlopen(_KEV_URL, timeout=30) as resp:
        data = json.loads(resp.read())

    cve_ids = [v["cveID"] for v in data.get("vulnerabilities", [])]
    ts = datetime.now(timezone.utc).isoformat()

    for key, value in ((_KEY_IDS, json.dumps(cve_ids)), (_KEY_TS, ts)):
        row = session.query(PlatformSetting).filter(PlatformSetting.key == key).first()
        if row:
            row.value = value
        else:
            session.add(PlatformSetting(id=str(uuid.uuid4()), key=key, value=value))

    session.commit()
    return len(cve_ids)


def maybe_refresh_kev(session: Session) -> None:
    """Refresh KEV catalog if cache is older than 24 h (non-blocking, swallows errors)."""
    from app.models import PlatformSetting
    try:
        row = session.query(PlatformSetting).filter(PlatformSetting.key == _KEY_TS).first()
        if row:
            try:
                last = datetime.fromisoformat(row.value)
                if last.tzinfo is None:
                    last = last.replace(tzinfo=timezone.utc)
                if datetime.now(timezone.utc) - last < timedelta(hours=24):
                    return
            except ValueError:
                pass
        count = refresh_kev_catalog(session)
        print(f"[kev] catalog refreshed: {count} entries")
    except Exception as exc:
        print(f"[kev] refresh skipped (non-blocking): {exc}")


@router.get("/status")
def kev_status(
    principal: dict = Depends(require_platform_auth),
    session: Session = Depends(get_session),
) -> dict:
    assert_ci_permission(principal)
    from app.models import PlatformSetting
    ts_row = session.query(PlatformSetting).filter(PlatformSetting.key == _KEY_TS).first()
    ids_row = session.query(PlatformSetting).filter(PlatformSetting.key == _KEY_IDS).first()
    count = 0
    if ids_row:
        try:
            count = len(json.loads(ids_row.value))
        except Exception:
            pass
    return {
        "count": count,
        "last_updated": ts_row.value if ts_row else None,
        "source": _KEV_URL,
    }


@router.post("/refresh")
def kev_refresh(
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> dict:
    try:
        count = refresh_kev_catalog(session)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"KEV refresh failed: {exc}") from exc
    return {"count": count, "refreshed_at": datetime.now(timezone.utc).isoformat()}
