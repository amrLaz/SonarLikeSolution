"""Quality gates endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db import get_session
from app.models import QualityGateConfig

router = APIRouter(prefix="/api/v1/gates", tags=["gates"])

@router.get("/default")
async def get_default_gate(session: Session = Depends(get_session)) -> dict:
    """Get default quality gate."""
    gate = session.query(QualityGateConfig).first()
    if not gate:
        return {
            "min_maintainability_score": 50,
            "min_security_score": 50,
            "min_reliability_score": 50,
            "max_code_smells": 100,
            "max_vulnerabilities": 10,
            "max_security_hotspots": 10,
            "max_bugs": 10
        }
    return {
        "min_maintainability_score": gate.min_maintainability_score,
        "min_security_score": gate.min_security_score,
        "min_reliability_score": gate.min_reliability_score,
        "max_code_smells": gate.max_code_smells,
        "max_vulnerabilities": gate.max_vulnerabilities,
        "max_security_hotspots": gate.max_security_hotspots,
        "max_bugs": gate.max_bugs
    }
