"""Integrations endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.db import get_session
from app.auth import require_platform_auth
from app.models import ProjectIntegration
import uuid

router = APIRouter(prefix="/api/v1/integrations", tags=["integrations"])


class ProjectIntegrationRequest(BaseModel):
    """Request body for project integration."""
    repo_provider: str
    repo_url: str
    pipeline_provider: str
    pipeline_url: str


@router.get("/providers")
async def get_providers(auth = Depends(require_platform_auth)) -> list:
    """Get available providers."""
    return ["azure-devops", "github", "gitlab"]

@router.get("/projects")
async def get_integration_projects(session: Session = Depends(get_session)) -> list:
    """Get integration projects."""
    return []

@router.get("/azure-devops/configs")
async def get_azure_configs(session: Session = Depends(get_session)) -> list:
    """Get Azure DevOps configurations."""
    return []

@router.put("/projects/{project_key}")
async def update_project_integration(
    project_key: str,
    request: ProjectIntegrationRequest,
    session: Session = Depends(get_session),
    auth = Depends(require_platform_auth)
) -> dict:
    """Update project integration configuration."""
    # Find existing integration or create new one
    integration = session.query(ProjectIntegration).filter(
        ProjectIntegration.project_key == project_key
    ).first()
    
    if integration:
        # Update existing
        integration.repo_provider = request.repo_provider
        integration.repo_url = request.repo_url
        integration.pipeline_provider = request.pipeline_provider
        integration.pipeline_url = request.pipeline_url
    else:
        # Create new
        integration = ProjectIntegration(
            id=str(uuid.uuid4()),
            project_key=project_key,
            repo_provider=request.repo_provider,
            repo_url=request.repo_url,
            pipeline_provider=request.pipeline_provider,
            pipeline_url=request.pipeline_url,
        )
        session.add(integration)
    
    session.commit()
    session.refresh(integration)
    
    return {
        "project_key": integration.project_key,
        "repo_provider": integration.repo_provider,
        "repo_url": integration.repo_url,
        "pipeline_provider": integration.pipeline_provider,
        "pipeline_url": integration.pipeline_url,
    }
