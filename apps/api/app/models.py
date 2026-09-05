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
from sqlalchemy.orm import Mapped, declarative_base, mapped_column, relationship

Base = declarative_base()


class Project(Base):
    """SAST Project containing multiple branches and analyses."""
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
    key: Mapped[str] = mapped_column(String(100), unique=True, index=True)  # TESTPROJECT, Commercant
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    organization_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("organizations.id"), index=True)
    analysis_profile_id: Mapped[Optional[str]] = mapped_column(String(100))
    analysis_profile_version: Mapped[Optional[str]] = mapped_column(String(50))
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
    maintainability_score: Mapped[Optional[int]] = mapped_column(Integer)
    security_score: Mapped[Optional[int]] = mapped_column(Integer)
    reliability_score: Mapped[Optional[int]] = mapped_column(Integer)
    code_smells: Mapped[Optional[int]] = mapped_column(Integer)
    vulnerabilities: Mapped[Optional[int]] = mapped_column(Integer)
    security_hotspots: Mapped[Optional[int]] = mapped_column(Integer)
    bugs: Mapped[Optional[int]] = mapped_column(Integer)
    coverage: Mapped[Optional[int]] = mapped_column(Integer)
    duplication: Mapped[Optional[int]] = mapped_column(Integer)
    dependency_vulnerabilities: Mapped[Optional[int]] = mapped_column(Integer)

    # P0 authoritative measurement contract. Legacy scalar columns remain for
    # compatibility, but their zero defaults never establish completeness.
    measurements: Mapped[str] = mapped_column(Text, default="{}")
    tool_executions: Mapped[str] = mapped_column(Text, default="[]")
    completeness: Mapped[str] = mapped_column(String(50), default="legacy_unverified")
    profile_id: Mapped[str] = mapped_column(String(100), default="legacy")
    profile_version: Mapped[str] = mapped_column(String(50), default="0")
    formula_version: Mapped[str] = mapped_column(String(50), default="0")
    gate_snapshot: Mapped[str] = mapped_column(Text, default="{}")

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
    """Quality gate configuration — one row per named gate."""
    __tablename__ = "quality_gate_config"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), default="Default Gate")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)

    min_maintainability_score: Mapped[int] = mapped_column(Integer, default=50)
    min_security_score: Mapped[int] = mapped_column(Integer, default=50)
    min_reliability_score: Mapped[int] = mapped_column(Integer, default=50)
    max_code_smells: Mapped[int] = mapped_column(Integer, default=100)
    max_vulnerabilities: Mapped[int] = mapped_column(Integer, default=10)
    max_security_hotspots: Mapped[int] = mapped_column(Integer, default=10)
    max_bugs: Mapped[int] = mapped_column(Integer, default=10)


class ProjectGateAssignment(Base):
    """Maps a project to a specific quality gate; unassigned projects use the default."""
    __tablename__ = "project_gate_assignments"

    project_key: Mapped[str] = mapped_column(String(255), primary_key=True)
    gate_id: Mapped[str] = mapped_column(String(36), ForeignKey("quality_gate_config.id"))
    assigned_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))


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
    scopes: Mapped[str] = mapped_column(Text, default="[]")

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


class RuleSuppression(Base):
    """Globally suppressed SAST rules (false positives / accepted risks)."""
    __tablename__ = "rule_suppressions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    rule_key: Mapped[str] = mapped_column(String(500), unique=True, index=True)
    suppressed_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    note: Mapped[Optional[str]] = mapped_column(Text)


class PlatformUser(Base):
    """Platform user — local credentials or SSO-provisioned."""
    __tablename__ = "platform_users"

    user_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(50), default="default")  # admin / regular / default
    hashed_password: Mapped[Optional[str]] = mapped_column(Text)       # null for SSO-only users
    auth_provider: Mapped[str] = mapped_column(String(50), default="local")  # local / entra
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    entra_tenant_id: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    entra_object_id: Mapped[Optional[str]] = mapped_column(String(64), index=True)

    __table_args__ = (
        Index("idx_platform_user_email", "email"),
        Index("idx_platform_user_role", "role"),
        Index("uq_platform_user_entra", "entra_tenant_id", "entra_object_id", unique=True),
    )


class Organization(Base):
    """Authorization boundary containing projects."""
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    key: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))


class UserGrant(Base):
    """Explicit organization or project read grant for a platform user."""
    __tablename__ = "user_grants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("platform_users.user_id"), index=True)
    scope_type: Mapped[str] = mapped_column(String(20))  # organization | project
    scope_id: Mapped[str] = mapped_column(String(100), index=True)  # org UUID | project key
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("uq_user_grant", "user_id", "scope_type", "scope_id", unique=True),
    )


class TokenProjectAccess(Base):
    """Explicit project authorization for a CI token."""
    __tablename__ = "token_project_access"

    token_id: Mapped[str] = mapped_column(String(36), ForeignKey("platform_api_tokens.token_id"), primary_key=True)
    project_key: Mapped[str] = mapped_column(String(100), primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))


class OidcTransaction(Base):
    """Single-use browser-bound Entra authorization transaction."""
    __tablename__ = "oidc_transactions"

    state_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    cookie_hash: Mapped[str] = mapped_column(String(64), index=True)
    nonce: Mapped[str] = mapped_column(String(128))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime)


class PlatformSetting(Base):
    """Platform settings and configuration."""
    __tablename__ = "platform_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
    key: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    value: Mapped[str] = mapped_column(Text)
    description: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class NotificationChannel(Base):
    """A destination for quality-gate event notifications (webhook or email)."""
    __tablename__ = "notification_channels"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    channel_type: Mapped[str] = mapped_column(String(50))  # webhook | email
    config: Mapped[str] = mapped_column(Text, default="{}")  # JSON: url / smtp + to_email
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    on_fail: Mapped[bool] = mapped_column(Boolean, default=True)   # fire when QG = fail
    on_pass: Mapped[bool] = mapped_column(Boolean, default=False)  # fire when QG = pass (recovery)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class AuditLog(Base):
    """Immutable record of every security-relevant action on the platform."""
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    actor_email: Mapped[str] = mapped_column(String(255))
    actor_role: Mapped[str] = mapped_column(String(50))
    action: Mapped[str] = mapped_column(String(100))        # e.g. "user.create", "rule.suppress"
    resource_type: Mapped[str] = mapped_column(String(100)) # e.g. "user", "rule", "token"
    resource_id: Mapped[Optional[str]] = mapped_column(String(255))
    resource_label: Mapped[Optional[str]] = mapped_column(String(500))
    details: Mapped[Optional[str]] = mapped_column(Text)    # JSON blob for extra context
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("idx_audit_actor", "actor_email"),
        Index("idx_audit_action", "action"),
        Index("idx_audit_created_at", "created_at"),
    )
