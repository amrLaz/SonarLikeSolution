"""
Database models for SAST platform.

Models:
- Project: SAST project (contains multiple branches)
- Branch: Git branch within a project (contains multiple analyses)
- AnalysisRecord: Code analysis result
- RetentionPolicy: Data retention rules
- AzureDevOpsOrganizationConfig: ADO integration config
- QualityGateConfig: Quality gate rules
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy import String, Integer, DateTime, Boolean, Text, Float, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


class Project(Base):
    """SAST Project containing multiple branches and analyses."""
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
    key: Mapped[str] = mapped_column(String(100), unique=True, index=True)  # TESTPROJECT, Commercant
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    branches: Mapped[list["Branch"]] = relationship("Branch", back_populates="project", cascade="all, delete-orphan")
    retention_policy: Mapped[Optional["RetentionPolicy"]] = relationship("RetentionPolicy", back_populates="project", uselist=False, cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_project_key", "key"),
        Index("idx_project_archived", "archived"),
    )


class Branch(Base):
    """Git branch within a project."""
    __tablename__ = "branches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))  # master, main, feature/xyz
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="branches")

    __table_args__ = (
        Index("idx_branch_project_name", "project_id", "name"),
        Index("idx_branch_default", "project_id", "is_default"),
    )


class AnalysisRecord(Base):
    """Code analysis result."""
    __tablename__ = "analysis_records"

    analysis_id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
    project_key: Mapped[str] = mapped_column(String(255), index=True)
    
    commit_sha: Mapped[str] = mapped_column(String(255), index=True)
    branch: Mapped[str] = mapped_column(String(255), index=True)
    ci_provider: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(50), default="queued")  # queued, running, completed, failed
    quality_gate: Mapped[str] = mapped_column(String(50), default="unknown")  # pass, fail, unknown

    # Metrics
    maintainability_score: Mapped[int] = mapped_column(Integer, default=0)
    security_score: Mapped[int] = mapped_column(Integer, default=0)
    reliability_score: Mapped[int] = mapped_column(Integer, default=0)
    code_smells: Mapped[int] = mapped_column(Integer, default=0)
    vulnerabilities: Mapped[int] = mapped_column(Integer, default=0)
    security_hotspots: Mapped[int] = mapped_column(Integer, default=0)
    bugs: Mapped[int] = mapped_column(Integer, default=0)
    coverage: Mapped[int] = mapped_column(Integer, default=0)
    duplication: Mapped[int] = mapped_column(Integer, default=0)
    dependency_vulnerabilities: Mapped[int] = mapped_column(Integer, default=0)

    affected_files: Mapped[str] = mapped_column(Text, default="{}")
    gate_failures: Mapped[str] = mapped_column(Text, default="[]")
    
    # PR decoration fields
    pr_id: Mapped[Optional[str]] = mapped_column(String(64), default="")
    pr_repo_id: Mapped[Optional[str]] = mapped_column(String(255), default="")
    pr_ado_project: Mapped[Optional[str]] = mapped_column(String(255), default="")
    pr_target_branch: Mapped[Optional[str]] = mapped_column(String(255), default="")
    pr_decoration_status: Mapped[Optional[str]] = mapped_column(String(50), default="")
    pr_decoration_error: Mapped[Optional[str]] = mapped_column(Text, default="")

    created_at: Mapped[str] = mapped_column(String(64), index=True)

    __table_args__ = (
        Index("idx_analysis_project_key", "project_key"),
        Index("idx_analysis_created_at", "created_at"),
        Index("idx_analysis_status", "status"),
    )


class RetentionPolicy(Base):
    """Data retention policy for a project."""
    __tablename__ = "retention_policies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), unique=True, index=True)
    
    # Retention rules
    keep_analyses_days: Mapped[int] = mapped_column(Integer, default=90)  # Keep analyses for 90 days
    keep_failed_analyses_days: Mapped[int] = mapped_column(Integer, default=30)  # Keep failed analyses for 30 days
    keep_master_branch_days: Mapped[int] = mapped_column(Integer, default=365)  # Keep master branch forever (1 year)
    auto_delete_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_cleanup_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="retention_policy")

    __table_args__ = (
        Index("idx_retention_policy_project", "project_id"),
    )


class QualityGateConfig(Base):
    """Quality gate configuration."""
    __tablename__ = "quality_gate_config"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    
    min_maintainability_score: Mapped[int] = mapped_column(Integer, default=50)
    min_security_score: Mapped[int] = mapped_column(Integer, default=50)
    min_reliability_score: Mapped[int] = mapped_column(Integer, default=50)
    max_code_smells: Mapped[int] = mapped_column(Integer, default=100)
    max_vulnerabilities: Mapped[int] = mapped_column(Integer, default=10)
    max_security_hotspots: Mapped[int] = mapped_column(Integer, default=10)
    max_bugs: Mapped[int] = mapped_column(Integer, default=10)


class AzureDevOpsOrganizationConfig(Base):
    """Azure DevOps organization configuration for PR decoration."""
    __tablename__ = "azure_devops_org_config"

    config_id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
    config_name: Mapped[str] = mapped_column(String(255), unique=True, index=True)  # e.g., "up-group-azure-devops"
    organization_url: Mapped[str] = mapped_column(String(500), unique=True, index=True)  # e.g., "https://dev.azure.com/up-group"
    pat: Mapped[str] = mapped_column(String(255))  # Personal Access Token
    quality_gate_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    repo_import_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(50), default="ready")  # ready, validated, error
    last_tested_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_error: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class AuthProviderConfig(Base):
    """Authentication provider configuration."""
    __tablename__ = "auth_provider_config"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
    provider_type: Mapped[str] = mapped_column(String(50))  # oauth, saml, ldap
    name: Mapped[str] = mapped_column(String(255))
    config: Mapped[str] = mapped_column(Text)  # JSON config
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    category: Mapped[str] = mapped_column(String(100), default="DevOps Platform")
    connection_url: Mapped[str] = mapped_column(String(500), default="")
    status: Mapped[str] = mapped_column(String(50), default="ready")  # ready, validated, disabled
    last_tested_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class PlatformApiToken(Base):
    """CI/CD API token issued to authenticate analysis submissions."""
    __tablename__ = "platform_api_tokens"

    token_id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
    token_name: Mapped[str] = mapped_column(String(255))
    token_hash: Mapped[str] = mapped_column(String(64), index=True)  # sha256 hex digest
    token_preview: Mapped[str] = mapped_column(String(16))  # last 4 chars, e.g. "...ab12"
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    __table_args__ = (
        Index("idx_platform_token_hash", "token_hash"),
        Index("idx_platform_token_current", "is_current", "revoked"),
    )


class ProjectIntegration(Base):
    """Project integration configuration (repo & pipeline providers)."""
    __tablename__ = "project_integrations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
    project_key: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    repo_provider: Mapped[str] = mapped_column(String(50))  # azure-devops, github, gitlab
    repo_url: Mapped[str] = mapped_column(String(500))
    pipeline_provider: Mapped[str] = mapped_column(String(50))  # azure-devops, github, gitlab
    pipeline_url: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("idx_project_integration_key", "project_key"),
    )


class PlatformSetting(Base):
    """Platform settings and configuration."""
    __tablename__ = "platform_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
    key: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    value: Mapped[str] = mapped_column(Text)
    description: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
