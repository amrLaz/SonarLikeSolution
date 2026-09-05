"""Quality gates — per-gate CRUD and per-project assignment."""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import allowed_project_keys, assert_ci_permission, require_platform_auth, require_role
from app.db import get_session
from app.models import AnalysisRecord, ProjectGateAssignment, QualityGateConfig

router = APIRouter(prefix="/api/v1/gates", tags=["gates"])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _project_count(session: Session, gate_id: str, default_gate_id: str, all_keys: set[str], assigned_keys: dict[str, str]) -> int:
    if gate_id == default_gate_id:
        return len([k for k, gid in assigned_keys.items() if gid == gate_id]) + len(all_keys - set(assigned_keys))
    return len([k for k, gid in assigned_keys.items() if gid == gate_id])


def _to_response(gate: QualityGateConfig, project_count: int = 0) -> dict:
    return {
        "gate_id": gate.id,
        "name": gate.name,
        "is_default": gate.is_default,
        "min_maintainability_score": gate.min_maintainability_score,
        "min_security_score": gate.min_security_score,
        "min_reliability_score": gate.min_reliability_score,
        "max_vulnerabilities": gate.max_vulnerabilities,
        "max_security_hotspots": gate.max_security_hotspots,
        "max_code_smells": gate.max_code_smells,
        "max_bugs": gate.max_bugs,
        "project_count": project_count,
    }


def _get_default(session: Session) -> QualityGateConfig:
    gate = session.query(QualityGateConfig).filter(QualityGateConfig.is_default.is_(True)).first()
    if not gate:
        gate = session.get(QualityGateConfig, "default")
    if not gate:
        gate = QualityGateConfig(id="default", name="Default Gate", is_default=True)
        session.add(gate)
        session.flush()
    return gate


def get_gate_for_project(session: Session, project_key: str) -> QualityGateConfig:
    """Return the gate assigned to this project, falling back to the default."""
    assignment = session.get(ProjectGateAssignment, project_key)
    if assignment:
        gate = session.get(QualityGateConfig, assignment.gate_id)
        if gate:
            return gate
    return _get_default(session)


# ── List & get ─────────────────────────────────────────────────────────────────

@router.get("")
def list_gates(
    principal: dict = Depends(require_platform_auth),
    session: Session = Depends(get_session),
) -> list[dict]:
    assert_ci_permission(principal)
    gates = session.query(QualityGateConfig).order_by(
        QualityGateConfig.is_default.desc(), QualityGateConfig.name
    ).all()

    all_keys = allowed_project_keys(principal, session)
    assignments = session.query(ProjectGateAssignment).filter(ProjectGateAssignment.project_key.in_(all_keys)).all() if all_keys else []
    assigned_map: dict[str, str] = {a.project_key: a.gate_id for a in assignments}
    default_gate = next((g for g in gates if g.is_default), gates[0] if gates else None)
    default_id = default_gate.id if default_gate else "default"

    return [_to_response(g, _project_count(session, g.id, default_id, all_keys, assigned_map)) for g in gates]


@router.get("/default")
def get_default_gate(
    principal: dict = Depends(require_platform_auth),
    session: Session = Depends(get_session),
) -> dict:
    """Backward-compatible endpoint used by the CI scan script."""
    assert_ci_permission(principal)
    return _to_response(_get_default(session))


@router.get("/assignments")
def list_assignments(
    principal: dict = Depends(require_platform_auth),
    session: Session = Depends(get_session),
) -> dict[str, str]:
    """Return {project_key: gate_id} for all explicitly assigned projects."""
    visible = allowed_project_keys(principal, session)
    return {a.project_key: a.gate_id for a in session.query(ProjectGateAssignment).filter(ProjectGateAssignment.project_key.in_(visible)).all()} if visible else {}


@router.get("/{gate_id}")
def get_gate(
    gate_id: str,
    principal: dict = Depends(require_platform_auth),
    session: Session = Depends(get_session),
) -> dict:
    assert_ci_permission(principal)
    gate = session.get(QualityGateConfig, gate_id)
    if not gate:
        raise HTTPException(status_code=404, detail="Gate not found")
    return _to_response(gate)


# ── Create / update / delete ───────────────────────────────────────────────────

class GateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    min_maintainability_score: int = Field(default=50, ge=0, le=100)
    min_security_score: int = Field(default=50, ge=0, le=100)
    min_reliability_score: int = Field(default=50, ge=0, le=100)
    max_vulnerabilities: int = Field(default=10, ge=0, le=10000)
    max_security_hotspots: int = Field(default=10, ge=0, le=10000)
    max_code_smells: int = Field(default=100, ge=0, le=100000)
    max_bugs: int = Field(default=10, ge=0, le=10000)


@router.post("")
def create_gate(
    request: GateRequest,
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> dict:
    gate = QualityGateConfig(
        id=str(uuid.uuid4()),
        name=request.name.strip(),
        is_default=False,
        min_maintainability_score=request.min_maintainability_score,
        min_security_score=request.min_security_score,
        min_reliability_score=request.min_reliability_score,
        max_vulnerabilities=request.max_vulnerabilities,
        max_security_hotspots=request.max_security_hotspots,
        max_code_smells=request.max_code_smells,
        max_bugs=request.max_bugs,
    )
    session.add(gate)
    session.commit()
    return _to_response(gate)


@router.put("/{gate_id}")
def update_gate(
    gate_id: str,
    request: GateRequest,
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> dict:
    gate = session.get(QualityGateConfig, gate_id)
    if not gate:
        raise HTTPException(status_code=404, detail="Gate not found")
    gate.name = request.name.strip()
    gate.min_maintainability_score = request.min_maintainability_score
    gate.min_security_score = request.min_security_score
    gate.min_reliability_score = request.min_reliability_score
    gate.max_vulnerabilities = request.max_vulnerabilities
    gate.max_security_hotspots = request.max_security_hotspots
    gate.max_code_smells = request.max_code_smells
    gate.max_bugs = request.max_bugs
    session.commit()
    return _to_response(gate)


@router.delete("/{gate_id}")
def delete_gate(
    gate_id: str,
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> dict:
    gate = session.get(QualityGateConfig, gate_id)
    if not gate:
        raise HTTPException(status_code=404, detail="Gate not found")
    if gate.is_default:
        raise HTTPException(status_code=400, detail="Cannot delete the default gate")
    # Projects assigned to this gate fall back to default
    session.query(ProjectGateAssignment).filter(ProjectGateAssignment.gate_id == gate_id).delete()
    session.delete(gate)
    session.commit()
    return {"status": "deleted"}


# ── Per-project assignment ─────────────────────────────────────────────────────

class AssignRequest(BaseModel):
    gate_id: str


@router.put("/assignments/{project_key}")
def assign_gate(
    project_key: str,
    request: AssignRequest,
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> dict:
    gate = session.get(QualityGateConfig, request.gate_id)
    if not gate:
        raise HTTPException(status_code=404, detail="Gate not found")
    existing = session.get(ProjectGateAssignment, project_key)
    if existing:
        existing.gate_id = request.gate_id
        existing.assigned_at = datetime.now(timezone.utc)
    else:
        session.add(ProjectGateAssignment(project_key=project_key, gate_id=request.gate_id))
    session.commit()
    return {"project_key": project_key, "gate_id": request.gate_id, "gate_name": gate.name}


@router.delete("/assignments/{project_key}")
def unassign_gate(
    project_key: str,
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> dict:
    """Remove explicit assignment — project reverts to the default gate."""
    session.query(ProjectGateAssignment).filter(
        ProjectGateAssignment.project_key == project_key
    ).delete()
    session.commit()
    default = _get_default(session)
    return {"project_key": project_key, "gate_id": default.id, "gate_name": default.name}
