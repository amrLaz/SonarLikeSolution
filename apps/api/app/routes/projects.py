"""
Project management endpoints for SAST platform.

Endpoints:
- GET /api/v1/projects - List all projects
- POST /api/v1/projects - Create new project
- GET /api/v1/projects/{project_id} - Get project details
- PATCH /api/v1/projects/{project_id} - Update project
- DELETE /api/v1/projects/{project_id} - Archive/delete project
- GET /api/v1/projects/{project_id}/branches - List branches
- GET /api/v1/projects/{project_id}/branches/{branch_name}/metrics - Get branch metrics
- POST /api/v1/projects/{project_id}/retention-policy - Set retention policy
- GET /api/v1/projects/{project_id}/retention-policy - Get retention policy
"""

from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import select, desc, and_, func

from app.auth import allowed_project_keys, assert_ci_permission, assert_project_access, require_platform_auth, require_role
from app.db import get_session
from app.models import Project, Branch, AnalysisRecord, Organization, RetentionPolicy

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])


# ── Pydantic Models ───────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    key: str = Field(min_length=2, max_length=100, description="Unique project key")
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    organization_id: Optional[str] = None
    analysis_profile_id: Optional[str] = None
    analysis_profile_version: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    archived: Optional[bool] = None
    organization_id: Optional[str] = None
    analysis_profile_id: Optional[str] = None
    analysis_profile_version: Optional[str] = None


class ProjectResponse(BaseModel):
    id: str
    key: str
    name: str
    description: Optional[str]
    archived: bool
    created_at: str
    updated_at: str
    branch_count: int = 0
    analysis_count: int = 0
    organization_id: Optional[str] = None
    permissions: dict[str, bool] = Field(default_factory=lambda: {"read": True, "manage": False})
    analysis_profile_id: Optional[str] = None
    analysis_profile_version: Optional[str] = None


class BranchMetrics(BaseModel):
    branch_name: str
    latest_analysis_id: Optional[str] = None
    maintainability_score: Optional[int] = None
    security_score: Optional[int] = None
    reliability_score: Optional[int] = None
    coverage: Optional[int] = None
    duplication: Optional[int] = None
    code_smells: Optional[int] = None
    vulnerabilities: Optional[int] = None
    bugs: Optional[int] = None
    quality_gate: Optional[str] = None
    analysis_date: Optional[str] = None


class RetentionPolicyRequest(BaseModel):
    keep_analyses_days: int = Field(default=90, ge=1, le=3650)
    keep_failed_analyses_days: int = Field(default=30, ge=1, le=365)
    keep_master_branch_days: int = Field(default=365, ge=1, le=3650)
    auto_delete_enabled: bool = Field(default=True)


class RetentionPolicyResponse(BaseModel):
    id: str
    project_id: str
    keep_analyses_days: int
    keep_failed_analyses_days: int
    keep_master_branch_days: int
    auto_delete_enabled: bool
    last_cleanup_at: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────

class OrganizationRequest(BaseModel):
    key: str = Field(min_length=2, max_length=100)
    name: str = Field(min_length=1, max_length=255)


def _validate_profile(profile_id: str | None, profile_version: str | None) -> None:
    if profile_id is None and profile_version is None:
        return
    from app.routes.analysis import PROFILE_CATALOG
    profile = PROFILE_CATALOG.get(profile_id or "")
    if not profile or profile.get("version") != profile_version:
        raise HTTPException(status_code=422, detail="Unknown analysis profile or version")


@router.get("/analysis-profiles/catalog")
async def list_analysis_profiles(principal: dict = Depends(require_platform_auth)) -> list[dict]:
    assert_ci_permission(principal)
    from app.routes.analysis import PROFILE_CATALOG
    return [{"profile_id": key, **value} for key, value in PROFILE_CATALOG.items()]


@router.get("/organizations/catalog")
async def list_organizations(
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> list[dict]:
    return [
        {"id": organization.id, "key": organization.key, "name": organization.name}
        for organization in session.query(Organization).order_by(Organization.name).all()
    ]


@router.post("/organizations/catalog")
async def create_organization(
    request: OrganizationRequest,
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> dict:
    if session.query(Organization).filter(Organization.key == request.key).first():
        raise HTTPException(status_code=409, detail="Organization key already exists")
    organization = Organization(id=str(uuid4()), key=request.key, name=request.name)
    session.add(organization)
    session.commit()
    return {"id": organization.id, "key": organization.key, "name": organization.name}

@router.get("")
async def list_projects(
    archived: Optional[bool] = Query(None, description="Filter by archived status"),
    principal: dict = Depends(require_platform_auth),
    session: Session = Depends(get_session)
) -> list[ProjectResponse]:
    """List all projects (optionally filter by archived status)."""
    visible_keys = allowed_project_keys(principal, session)
    query = select(Project).where(Project.key.in_(visible_keys))
    if archived is not None:
        query = query.where(Project.archived == archived)
    
    projects = session.execute(query).scalars().all()
    
    results = []
    for project in projects:
        branch_count = len(project.branches)
        # Count analyses by project_key (AnalysisRecord doesn't have FK to Project)
        analysis_count = session.execute(
            select(func.count()).select_from(AnalysisRecord).where(AnalysisRecord.project_key == project.key)
        ).scalar() or 0
        results.append(ProjectResponse(
            id=project.id,
            key=project.key,
            name=project.name,
            description=project.description,
            archived=project.archived,
            created_at=project.created_at.isoformat(),
            updated_at=project.updated_at.isoformat(),
            branch_count=branch_count,
            analysis_count=analysis_count,
            organization_id=project.organization_id,
            permissions={"read": True, "manage": principal.get("role") == "admin"},
            analysis_profile_id=project.analysis_profile_id,
            analysis_profile_version=project.analysis_profile_version,
        ))
    
    return results


@router.post("")
async def create_project(
    request: ProjectCreate,
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session)
) -> ProjectResponse:
    """Create a new project."""
    # Check if key already exists
    existing = session.execute(
        select(Project).where(Project.key == request.key)
    ).scalar_one_or_none()
    
    if existing:
        raise HTTPException(status_code=409, detail=f"Project key '{request.key}' already exists")
    
    if request.organization_id and not session.get(Organization, request.organization_id):
        raise HTTPException(status_code=422, detail="Unknown organization")
    _validate_profile(request.analysis_profile_id, request.analysis_profile_version)
    project = Project(
        id=str(uuid4()),
        key=request.key,
        name=request.name,
        description=request.description,
        organization_id=request.organization_id,
        analysis_profile_id=request.analysis_profile_id,
        analysis_profile_version=request.analysis_profile_version,
    )
    
    session.add(project)
    session.commit()
    session.refresh(project)
    
    return ProjectResponse(
        id=project.id,
        key=project.key,
        name=project.name,
        description=project.description,
        archived=project.archived,
        created_at=project.created_at.isoformat(),
        updated_at=project.updated_at.isoformat(),
        branch_count=0,
        analysis_count=0,
        organization_id=project.organization_id,
        permissions={"read": True, "manage": True},
        analysis_profile_id=project.analysis_profile_id,
        analysis_profile_version=project.analysis_profile_version,
    )


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    principal: dict = Depends(require_platform_auth),
    session: Session = Depends(get_session)
) -> ProjectResponse:
    """Get project details."""
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    assert_project_access(principal, session, project.key)
    
    return ProjectResponse(
        id=project.id,
        key=project.key,
        name=project.name,
        description=project.description,
        archived=project.archived,
        created_at=project.created_at.isoformat(),
        updated_at=project.updated_at.isoformat(),
        branch_count=len(project.branches),
        analysis_count=session.query(AnalysisRecord).filter(AnalysisRecord.project_key == project.key).count(),
        organization_id=project.organization_id,
        permissions={"read": True, "manage": principal.get("role") == "admin"},
        analysis_profile_id=project.analysis_profile_id,
        analysis_profile_version=project.analysis_profile_version,
    )


@router.patch("/{project_id}")
async def update_project(
    project_id: str,
    request: ProjectUpdate,
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session)
) -> ProjectResponse:
    """Update project details."""
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if request.name is not None:
        project.name = request.name
    if request.description is not None:
        project.description = request.description
    if request.archived is not None:
        project.archived = request.archived
    if request.organization_id is not None:
        if not session.get(Organization, request.organization_id):
            raise HTTPException(status_code=422, detail="Unknown organization")
        project.organization_id = request.organization_id
    if request.analysis_profile_id is not None:
        _validate_profile(request.analysis_profile_id, request.analysis_profile_version or project.analysis_profile_version)
        project.analysis_profile_id = request.analysis_profile_id
    if request.analysis_profile_version is not None:
        _validate_profile(request.analysis_profile_id or project.analysis_profile_id, request.analysis_profile_version)
        project.analysis_profile_version = request.analysis_profile_version
    
    project.updated_at = datetime.now(timezone.utc)
    session.commit()
    session.refresh(project)
    
    return ProjectResponse(
        id=project.id,
        key=project.key,
        name=project.name,
        description=project.description,
        archived=project.archived,
        created_at=project.created_at.isoformat(),
        updated_at=project.updated_at.isoformat(),
        branch_count=len(project.branches),
        analysis_count=session.query(AnalysisRecord).filter(AnalysisRecord.project_key == project.key).count(),
        organization_id=project.organization_id,
        permissions={"read": True, "manage": True},
        analysis_profile_id=project.analysis_profile_id,
        analysis_profile_version=project.analysis_profile_version,
    )


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session)
) -> dict:
    """Archive a project (soft delete)."""
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project.archived = True
    project.updated_at = datetime.now(timezone.utc)
    session.commit()
    
    return {"status": "archived", "project_id": project_id}


@router.get("/{project_id}/branches")
async def list_branches(
    project_id: str,
    principal: dict = Depends(require_platform_auth),
    session: Session = Depends(get_session)
) -> list[BranchMetrics]:
    """List all branches for a project with their latest metrics."""
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    assert_project_access(principal, session, project.key)
    
    project_key = project.key
    
    branches = session.execute(
        select(Branch).where(Branch.project_id == project_id).order_by(Branch.is_default.desc(), Branch.name)
    ).scalars().all()

    # Single query: latest analysis per branch (avoids N+1).
    from sqlalchemy import text as _text
    branch_names = [b.name for b in branches]
    if branch_names:
        latest_rows = session.execute(_text("""
            SELECT DISTINCT ON (branch)
                branch, analysis_id, maintainability_score, security_score,
                reliability_score, coverage, duplication, code_smells,
                vulnerabilities, bugs, quality_gate, created_at
            FROM analysis_records
            WHERE project_key = :pk AND branch = ANY(:branches)
            ORDER BY branch, created_at DESC
        """), {"pk": project_key, "branches": branch_names}).mappings().all()
        latest_by_branch = {r["branch"]: r for r in latest_rows}
    else:
        latest_by_branch = {}

    results = []
    for branch in branches:
        a = latest_by_branch.get(branch.name)
        results.append(BranchMetrics(
            branch_name=branch.name,
            latest_analysis_id=a["analysis_id"] if a else None,
            maintainability_score=a["maintainability_score"] if a else None,
            security_score=a["security_score"] if a else None,
            reliability_score=a["reliability_score"] if a else None,
            coverage=a["coverage"] if a else None,
            duplication=a["duplication"] if a else None,
            code_smells=a["code_smells"] if a else None,
            vulnerabilities=a["vulnerabilities"] if a else None,
            bugs=a["bugs"] if a else None,
            quality_gate=a["quality_gate"] if a else None,
            analysis_date=a["created_at"].isoformat() if a else None
        ))

    return results


@router.post("/{project_id}/retention-policy")
async def set_retention_policy(
    project_id: str,
    request: RetentionPolicyRequest,
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session)
) -> RetentionPolicyResponse:
    """Set or update retention policy for a project."""
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    policy = session.execute(
        select(RetentionPolicy).where(RetentionPolicy.project_id == project_id)
    ).scalar_one_or_none()
    
    if not policy:
        policy = RetentionPolicy(
            id=str(uuid4()),
            project_id=project_id,
            keep_analyses_days=request.keep_analyses_days,
            keep_failed_analyses_days=request.keep_failed_analyses_days,
            keep_master_branch_days=request.keep_master_branch_days,
            auto_delete_enabled=request.auto_delete_enabled
        )
        session.add(policy)
    else:
        policy.keep_analyses_days = request.keep_analyses_days
        policy.keep_failed_analyses_days = request.keep_failed_analyses_days
        policy.keep_master_branch_days = request.keep_master_branch_days
        policy.auto_delete_enabled = request.auto_delete_enabled
        policy.updated_at = datetime.now(timezone.utc)
    
    session.commit()
    session.refresh(policy)
    
    return RetentionPolicyResponse(
        id=policy.id,
        project_id=policy.project_id,
        keep_analyses_days=policy.keep_analyses_days,
        keep_failed_analyses_days=policy.keep_failed_analyses_days,
        keep_master_branch_days=policy.keep_master_branch_days,
        auto_delete_enabled=policy.auto_delete_enabled,
        last_cleanup_at=policy.last_cleanup_at.isoformat() if policy.last_cleanup_at else None
    )


@router.get("/{project_id}/retention-policy")
async def get_retention_policy(
    project_id: str,
    principal: dict = Depends(require_platform_auth),
    session: Session = Depends(get_session)
) -> RetentionPolicyResponse:
    """Get retention policy for a project."""
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    assert_project_access(principal, session, project.key)
    policy = session.execute(
        select(RetentionPolicy).where(RetentionPolicy.project_id == project_id)
    ).scalar_one_or_none()
    
    if not policy:
        raise HTTPException(status_code=404, detail="Retention policy not found")
    
    return RetentionPolicyResponse(
        id=policy.id,
        project_id=policy.project_id,
        keep_analyses_days=policy.keep_analyses_days,
        keep_failed_analyses_days=policy.keep_failed_analyses_days,
        keep_master_branch_days=policy.keep_master_branch_days,
        auto_delete_enabled=policy.auto_delete_enabled,
        last_cleanup_at=policy.last_cleanup_at.isoformat() if policy.last_cleanup_at else None
    )
