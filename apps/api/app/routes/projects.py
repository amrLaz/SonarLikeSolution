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
from sqlalchemy import select, desc, and_

from app.db import get_session
from app.models import Project, Branch, AnalysisRecord, RetentionPolicy

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])


# ── Pydantic Models ───────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    key: str = Field(min_length=2, max_length=100, description="Unique project key")
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    archived: Optional[bool] = None


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

@router.get("")
async def list_projects(
    archived: Optional[bool] = Query(None, description="Filter by archived status"),
    session: Session = Depends(get_session)
) -> list[ProjectResponse]:
    """List all projects (optionally filter by archived status)."""
    query = select(Project)
    if archived is not None:
        query = query.where(Project.archived == archived)
    
    projects = session.execute(query).scalars().all()
    
    results = []
    for project in projects:
        branch_count = len(project.branches)
        analysis_count = len(project.analyses)
        results.append(ProjectResponse(
            id=project.id,
            key=project.key,
            name=project.name,
            description=project.description,
            archived=project.archived,
            created_at=project.created_at.isoformat(),
            updated_at=project.updated_at.isoformat(),
            branch_count=branch_count,
            analysis_count=analysis_count
        ))
    
    return results


@router.post("")
async def create_project(
    request: ProjectCreate,
    session: Session = Depends(get_session)
) -> ProjectResponse:
    """Create a new project."""
    # Check if key already exists
    existing = session.execute(
        select(Project).where(Project.key == request.key)
    ).scalar_one_or_none()
    
    if existing:
        raise HTTPException(status_code=409, detail=f"Project key '{request.key}' already exists")
    
    project = Project(
        id=str(uuid4()),
        key=request.key,
        name=request.name,
        description=request.description
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
        analysis_count=0
    )


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    session: Session = Depends(get_session)
) -> ProjectResponse:
    """Get project details."""
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return ProjectResponse(
        id=project.id,
        key=project.key,
        name=project.name,
        description=project.description,
        archived=project.archived,
        created_at=project.created_at.isoformat(),
        updated_at=project.updated_at.isoformat(),
        branch_count=len(project.branches),
        analysis_count=len(project.analyses)
    )


@router.patch("/{project_id}")
async def update_project(
    project_id: str,
    request: ProjectUpdate,
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
        analysis_count=len(project.analyses)
    )


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
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
    session: Session = Depends(get_session)
) -> list[BranchMetrics]:
    """List all branches for a project with their latest metrics."""
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    branches = session.execute(
        select(Branch).where(Branch.project_id == project_id).order_by(Branch.is_default.desc(), Branch.name)
    ).scalars().all()
    
    results = []
    for branch in branches:
        # Get latest analysis
        latest_analysis = session.execute(
            select(AnalysisRecord)
            .where(AnalysisRecord.branch_id == branch.id)
            .order_by(desc(AnalysisRecord.created_at))
            .limit(1)
        ).scalar_one_or_none()
        
        results.append(BranchMetrics(
            branch_name=branch.name,
            latest_analysis_id=latest_analysis.id if latest_analysis else None,
            maintainability_score=latest_analysis.maintainability_score if latest_analysis else None,
            security_score=latest_analysis.security_score if latest_analysis else None,
            reliability_score=latest_analysis.reliability_score if latest_analysis else None,
            coverage=latest_analysis.coverage if latest_analysis else None,
            duplication=latest_analysis.duplication if latest_analysis else None,
            code_smells=latest_analysis.code_smells if latest_analysis else None,
            vulnerabilities=latest_analysis.vulnerabilities if latest_analysis else None,
            bugs=latest_analysis.bugs if latest_analysis else None,
            quality_gate=latest_analysis.quality_gate if latest_analysis else None,
            analysis_date=latest_analysis.created_at.isoformat() if latest_analysis else None
        ))
    
    return results


@router.post("/{project_id}/retention-policy")
async def set_retention_policy(
    project_id: str,
    request: RetentionPolicyRequest,
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
    session: Session = Depends(get_session)
) -> RetentionPolicyResponse:
    """Get retention policy for a project."""
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
