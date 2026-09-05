"""Integrations endpoints."""

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import allowed_project_keys, assert_project_access, optional_platform_auth, require_platform_auth, require_role
from app.db import get_session
from app.models import AzureDevOpsOrganizationConfig, AuthProviderConfig, ProjectIntegration

router = APIRouter(prefix="/api/v1/integrations", tags=["integrations"])


class ProjectIntegrationRequest(BaseModel):
    """Request body for project integration."""
    repo_provider: str
    repo_url: str
    pipeline_provider: str
    pipeline_url: str


class AzureDevOpsConfigRequest(BaseModel):
    """Request body for Azure DevOps configuration."""
    config_name: str
    organization_url: str
    personal_access_token: str
    repo_import_enabled: bool = False
    quality_gate_enabled: bool = False


class AzureDevOpsConfigResponse(BaseModel):
    """Response for Azure DevOps configuration."""
    config_id: str
    config_name: str
    organization_url: str
    quality_gate_enabled: bool
    repo_import_enabled: bool
    pat_configured: bool
    status: str
    last_tested_at: str | None
    last_error: str | None
    created_at: str
    updated_at: str


class AuthProviderUpdateRequest(BaseModel):
    """Request body to update an auth provider."""
    connection_url: str = ""
    config_json: dict[str, Any] | None = None


def _to_provider_response(provider: AuthProviderConfig) -> dict:
    try:
        config_raw: dict[str, Any] = json.loads(provider.config or "{}")
    except Exception:
        config_raw = {}
    # Strip client_secret from the response; signal its presence via a bool flag
    config_safe = {k: v for k, v in config_raw.items() if k != "client_secret"}
    if "client_secret" in config_raw:
        config_safe["client_secret_configured"] = bool(config_raw["client_secret"])
    return {
        "provider_id": provider.provider_type,
        "display_name": provider.name,
        "category": provider.category,
        "connection_url": provider.connection_url,
        "enabled": provider.enabled,
        "status": provider.status,
        "last_tested_at": provider.last_tested_at.isoformat() if provider.last_tested_at else "",
        "config": config_safe,
    }


def _get_provider_or_404(session: Session, provider_id: str) -> AuthProviderConfig:
    provider = session.query(AuthProviderConfig).filter(
        AuthProviderConfig.provider_type == provider_id
    ).first()
    if not provider:
        raise HTTPException(status_code=404, detail=f"Provider '{provider_id}' not found")
    return provider


@router.get("/providers")
async def get_providers(
    principal: dict | None = Depends(optional_platform_auth),
    session: Session = Depends(get_session),
) -> list:
    """Get configured authentication providers."""
    providers = session.query(AuthProviderConfig).order_by(AuthProviderConfig.provider_type).all()
    responses = [_to_provider_response(provider) for provider in providers]
    if principal and principal.get("kind") == "user" and principal.get("role") == "admin":
        return responses
    return [
        {key: item[key] for key in ("provider_id", "display_name", "category", "enabled")}
        for item in responses
    ]


@router.put("/providers/{provider_id}")
async def update_provider(
    provider_id: str,
    request: AuthProviderUpdateRequest,
    session: Session = Depends(get_session),
    auth = Depends(require_role("admin"))
) -> dict:
    """Update an authentication provider's connection URL and/or OIDC config."""
    provider = _get_provider_or_404(session, provider_id)
    if request.connection_url:
        provider.connection_url = request.connection_url
    if request.config_json is not None:
        existing: dict[str, Any] = {}
        try:
            existing = json.loads(provider.config or "{}")
        except Exception:
            pass
        merged = {**existing, **request.config_json}
        # Never blank-overwrite the stored client_secret if the update omits it
        if not merged.get("client_secret") and existing.get("client_secret"):
            merged["client_secret"] = existing["client_secret"]
        if provider_id == "azure-ad" and merged.get("redirect_uri"):
            from app.routes.auth_entra import validate_redirect_uri
            validate_redirect_uri(str(merged["redirect_uri"]))
        provider.config = json.dumps(merged)
    provider.updated_at = datetime.now(timezone.utc)
    session.commit()
    session.refresh(provider)
    return _to_provider_response(provider)


@router.post("/providers/{provider_id}/test")
async def test_provider(
    provider_id: str,
    session: Session = Depends(get_session),
    auth = Depends(require_role("admin"))
) -> dict:
    """Validate an authentication provider's configuration."""
    provider = _get_provider_or_404(session, provider_id)
    if provider_id == "azure-ad":
        try:
            config: dict[str, Any] = json.loads(provider.config or "{}")
        except Exception:
            config = {}
        missing = [
            key for key in ("tenant_id", "client_id", "client_secret", "redirect_uri")
            if not isinstance(config.get(key), str) or not config[key].strip()
        ]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Azure AD configuration is incomplete — missing: {', '.join(missing)}"
            )
        from app.routes.auth_entra import validate_redirect_uri
        validate_redirect_uri(config["redirect_uri"])
    elif not provider.connection_url:
        raise HTTPException(status_code=400, detail="Connection URL is required before testing")
    provider.status = "validated"
    provider.enabled = True
    provider.last_tested_at = datetime.now(timezone.utc)
    provider.updated_at = provider.last_tested_at
    session.commit()
    session.refresh(provider)
    return _to_provider_response(provider)


@router.post("/providers/{provider_id}/disable")
async def disable_provider(
    provider_id: str,
    session: Session = Depends(get_session),
    auth = Depends(require_role("admin"))
) -> dict:
    """Disable an authentication provider."""
    provider = _get_provider_or_404(session, provider_id)
    provider.enabled = False
    provider.status = "disabled"
    provider.updated_at = datetime.now(timezone.utc)
    session.commit()
    session.refresh(provider)
    return _to_provider_response(provider)


@router.get("/projects")
async def get_integration_projects(
    principal: dict = Depends(require_platform_auth),
    session: Session = Depends(get_session),
) -> list:
    """Get integration projects."""
    visible = allowed_project_keys(principal, session)
    rows = session.query(ProjectIntegration).filter(ProjectIntegration.project_key.in_(visible)).all() if visible else []
    return [{
        "project_key": row.project_key,
        "repo_provider": row.repo_provider,
        "repo_url": row.repo_url,
        "pipeline_provider": row.pipeline_provider,
        "pipeline_url": row.pipeline_url,
    } for row in rows]


@router.get("/azure-devops/configs")
async def get_azure_configs(
    _: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
) -> list:
    """Get Azure DevOps configurations."""
    configs = session.query(AzureDevOpsOrganizationConfig).all()
    return [
        {
            "config_id": config.config_id,
            "config_name": config.config_name,
            "organization_url": config.organization_url,
            "quality_gate_enabled": config.quality_gate_enabled,
            "repo_import_enabled": config.repo_import_enabled,
            "pat_configured": bool(config.pat),
            "status": config.status,
            "last_tested_at": config.last_tested_at.isoformat() if config.last_tested_at else None,
            "last_error": config.last_error,
            "created_at": config.created_at.isoformat(),
            "updated_at": config.updated_at.isoformat(),
        }
        for config in configs
    ]


@router.post("/azure-devops/configs")
async def create_azure_config(
    request: AzureDevOpsConfigRequest,
    session: Session = Depends(get_session),
    auth = Depends(require_role("admin"))
) -> AzureDevOpsConfigResponse:
    """Create a new Azure DevOps configuration."""
    # Check if config_name already exists
    existing = session.query(AzureDevOpsOrganizationConfig).filter(
        AzureDevOpsOrganizationConfig.config_name == request.config_name
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail=f"Configuration '{request.config_name}' already exists")
    
    # Check if organization_url already exists
    existing_url = session.query(AzureDevOpsOrganizationConfig).filter(
        AzureDevOpsOrganizationConfig.organization_url == request.organization_url
    ).first()
    
    if existing_url:
        raise HTTPException(status_code=400, detail=f"Organization URL '{request.organization_url}' is already configured")
    
    config = AzureDevOpsOrganizationConfig(
        config_id=str(uuid.uuid4()),
        config_name=request.config_name,
        organization_url=request.organization_url,
        pat=request.personal_access_token,
        quality_gate_enabled=request.quality_gate_enabled,
        repo_import_enabled=request.repo_import_enabled,
        status="ready",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    session.add(config)
    session.commit()
    session.refresh(config)

    return AzureDevOpsConfigResponse(
        config_id=config.config_id,
        config_name=config.config_name,
        organization_url=config.organization_url,
        quality_gate_enabled=config.quality_gate_enabled,
        repo_import_enabled=config.repo_import_enabled,
        pat_configured=bool(config.pat),
        status=config.status,
        last_tested_at=config.last_tested_at.isoformat() if config.last_tested_at else None,
        last_error=config.last_error,
        created_at=config.created_at.isoformat(),
        updated_at=config.updated_at.isoformat(),
    )


@router.put("/azure-devops/configs/{config_id}")
async def update_azure_config(
    config_id: str,
    request: AzureDevOpsConfigRequest,
    session: Session = Depends(get_session),
    auth = Depends(require_role("admin"))
) -> AzureDevOpsConfigResponse:
    """Update an existing Azure DevOps configuration."""
    config = session.query(AzureDevOpsOrganizationConfig).filter(
        AzureDevOpsOrganizationConfig.config_id == config_id
    ).first()
    
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    
    # Check if new config_name already exists (for other configs)
    if request.config_name != config.config_name:
        existing = session.query(AzureDevOpsOrganizationConfig).filter(
            AzureDevOpsOrganizationConfig.config_name == request.config_name
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Configuration '{request.config_name}' already exists")
    
    # Check if new organization_url already exists (for other configs)
    if request.organization_url != config.organization_url:
        existing_url = session.query(AzureDevOpsOrganizationConfig).filter(
            AzureDevOpsOrganizationConfig.organization_url == request.organization_url
        ).first()
        if existing_url:
            raise HTTPException(status_code=400, detail=f"Organization URL '{request.organization_url}' is already configured")
    
    config.config_name = request.config_name
    config.organization_url = request.organization_url
    config.repo_import_enabled = request.repo_import_enabled
    config.quality_gate_enabled = request.quality_gate_enabled
    # Only update PAT if a new one is provided (non-empty)
    if request.personal_access_token:
        config.pat = request.personal_access_token
    config.updated_at = datetime.now(timezone.utc)

    session.commit()
    session.refresh(config)

    return AzureDevOpsConfigResponse(
        config_id=config.config_id,
        config_name=config.config_name,
        organization_url=config.organization_url,
        quality_gate_enabled=config.quality_gate_enabled,
        repo_import_enabled=config.repo_import_enabled,
        pat_configured=bool(config.pat),
        status=config.status,
        last_tested_at=config.last_tested_at.isoformat() if config.last_tested_at else None,
        last_error=config.last_error,
        created_at=config.created_at.isoformat(),
        updated_at=config.updated_at.isoformat(),
    )


@router.post("/azure-devops/configs/{config_id}/test")
async def test_azure_config(
    config_id: str,
    session: Session = Depends(get_session),
    auth = Depends(require_role("admin"))
) -> dict:
    """Test Azure DevOps configuration connectivity."""
    config = session.query(AzureDevOpsOrganizationConfig).filter(
        AzureDevOpsOrganizationConfig.config_id == config_id
    ).first()
    
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    
    try:
        import httpx
        import base64

        # Test against the organisation's own projects list — works with any
        # PAT scope that has at least Code/Read or Project/Read access, unlike
        # the VSSPS profile endpoint which requires the rarely-granted Profile scope.
        test_url = f"{config.organization_url.rstrip('/')}/_apis/projects?api-version=7.0&$top=1"
        auth_string = base64.b64encode(f":{config.pat}".encode()).decode()
        headers = {"Authorization": f"Basic {auth_string}"}

        async with httpx.AsyncClient(follow_redirects=True) as client:
            response = await client.get(test_url, headers=headers, timeout=10.0)

        if response.status_code == 401:
            raise HTTPException(
                status_code=400,
                detail="Invalid or expired Personal Access Token (401 from Azure DevOps)"
            )
        elif response.status_code == 403:
            raise HTTPException(
                status_code=400,
                detail="PAT is valid but lacks required permissions (need at least Project Read)"
            )
        elif response.status_code not in (200, 203):
            raise HTTPException(
                status_code=400,
                detail=f"Azure DevOps returned HTTP {response.status_code}"
            )

        config.status = "validated"
        config.last_tested_at = datetime.now(timezone.utc)
        config.last_error = None
        session.commit()

        return {
            "status": "ok",
            "message": "Azure DevOps Personal Access Token is valid and accessible"
        }
    except HTTPException as exc:
        config.status = "error"
        config.last_tested_at = datetime.now(timezone.utc)
        config.last_error = str(exc.detail)
        session.commit()
        raise
    except Exception as e:
        config.status = "error"
        config.last_tested_at = datetime.now(timezone.utc)
        config.last_error = str(e)
        session.commit()
        raise HTTPException(status_code=400, detail=f"Connection test failed: {str(e)}")


@router.delete("/azure-devops/configs/{config_id}")
async def delete_azure_config(
    config_id: str,
    session: Session = Depends(get_session),
    auth = Depends(require_role("admin"))
) -> dict:
    """Delete an Azure DevOps configuration."""
    config = session.query(AzureDevOpsOrganizationConfig).filter(
        AzureDevOpsOrganizationConfig.config_id == config_id
    ).first()
    
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    
    session.delete(config)
    session.commit()
    
    return {"message": f"Configuration '{config.config_name}' deleted successfully"}


@router.put("/projects/{project_key}")
async def update_project_integration(
    project_key: str,
    request: ProjectIntegrationRequest,
    session: Session = Depends(get_session),
    principal: dict = Depends(require_platform_auth),
) -> dict:
    """Update project integration configuration."""
    assert_project_access(principal, session, project_key, "integration:write")
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
