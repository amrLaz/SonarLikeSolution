"""Database connection and session management."""

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker, Session

_log = logging.getLogger(__name__)

postgres_host = os.getenv("POSTGRES_HOST", "newsastproject-db-1")
if postgres_host in ("db", ""):
    postgres_host = "newsastproject-db-1"

DB_HOST = os.getenv("DB_HOST") or postgres_host
DB_PORT = int(os.getenv("DB_PORT", os.getenv("POSTGRES_PORT", "5432")))
DB_USER = os.getenv("DB_USER", os.getenv("POSTGRES_USER", "sast_user"))
DB_PASSWORD = os.getenv("DB_PASSWORD", os.getenv("POSTGRES_PASSWORD", "sast_pass"))
DB_NAME = os.getenv("DB_NAME", os.getenv("POSTGRES_DB", "sast_db"))

# Use URL.create() so special chars in DB_PASSWORD are handled correctly.
# Azure PostgreSQL Flexible Server requires SSL.
_query = {"sslmode": "require"} if DB_HOST.endswith(".postgres.database.azure.com") else {}
DATABASE_URL = URL.create(
    drivername="postgresql+psycopg2",
    username=DB_USER,
    password=DB_PASSWORD,
    host=DB_HOST,
    port=DB_PORT,
    database=DB_NAME,
    query=_query,
)

_log.warning("[DB] host=%r port=%s db=%s ssl=%s", DB_HOST, DB_PORT, DB_NAME, bool(_query))

# Create engine with pool settings
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,  # Test connection before using
    pool_size=10,
    max_overflow=20,
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# Columns added after the tables were first created. create_all() only creates
# missing tables, it never alters an existing one, so these need an explicit
# idempotent ALTER TABLE on every startup.
_SCHEMA_PATCHES = [
    "ALTER TABLE azure_devops_org_config ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ready'",
    "ALTER TABLE azure_devops_org_config ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMP",
    "ALTER TABLE azure_devops_org_config ADD COLUMN IF NOT EXISTS last_error TEXT",
    "ALTER TABLE azure_devops_org_config ADD COLUMN IF NOT EXISTS repo_import_enabled BOOLEAN DEFAULT false",
    "ALTER TABLE auth_provider_config ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'DevOps Platform'",
    "ALTER TABLE auth_provider_config ADD COLUMN IF NOT EXISTS connection_url VARCHAR(500) DEFAULT ''",
    "ALTER TABLE auth_provider_config ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ready'",
    "ALTER TABLE auth_provider_config ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMP",
    "ALTER TABLE analysis_records ADD COLUMN IF NOT EXISTS dependency_vulnerabilities INTEGER DEFAULT 0",
    "ALTER TABLE quality_gate_config ADD COLUMN IF NOT EXISTS name VARCHAR(255) DEFAULT 'Default Gate'",
    "ALTER TABLE quality_gate_config ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false",
    # Mark the legacy single-row gate as default and give it a name
    "UPDATE quality_gate_config SET name = 'Default Gate', is_default = true WHERE id = 'default'",
]

# Default authentication provider catalog — upserted on every startup so new
# entries are added even when the table already has existing rows.
_DEFAULT_AUTH_PROVIDERS = [
    ("saml", "SAML 2.0", "Enterprise SSO", ""),
    ("azure-ad", "Azure AD / Entra ID", "Enterprise SSO", "https://login.microsoftonline.com"),
    ("azure-devops", "Azure DevOps", "DevOps Platform", "https://dev.azure.com"),
    ("github", "GitHub", "DevOps Platform", "https://github.com"),
    ("gitlab", "GitLab", "DevOps Platform", "https://gitlab.com"),
]


def migrate_db():
    """Apply schema and seed changes before starting application workers."""
    from app.models import Base
    try:
        Base.metadata.create_all(bind=engine)
        with engine.begin() as connection:
            for statement in _SCHEMA_PATCHES:
                connection.execute(text(statement))
            _apply_versioned_migrations(connection)
        _seed_default_auth_providers()
        _seed_default_admin()
        if os.getenv("P0_REQUIRE_COMPLETE_MAPPINGS", "false").lower() in {"1", "true", "yes"}:
            _validate_p0_mappings()
    except Exception as e:
        _log.exception("Error initializing database: %s", e)
        raise


def _apply_versioned_migrations(connection) -> None:
    """Apply packaged SQL migrations exactly once before serving requests."""
    connection.execute(text("SELECT pg_advisory_xact_lock(73482601)"))
    connection.execute(text(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        "version VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    ))
    migration_dir = Path(__file__).with_name("migrations")
    for path in sorted(migration_dir.glob("*.sql")):
        version = path.stem
        applied = connection.execute(
            text("SELECT 1 FROM schema_migrations WHERE version = :version"),
            {"version": version},
        ).scalar()
        if applied:
            continue
        # ponytail: migrations are deliberately plain, semicolon-delimited SQL;
        # switch to Alembic when schema changes need procedural parsing.
        for statement in path.read_text(encoding="utf-8").split(";"):
            if statement.strip():
                connection.execute(text(statement))
        connection.execute(
            text("INSERT INTO schema_migrations(version) VALUES (:version) ON CONFLICT DO NOTHING"),
            {"version": version},
        )


def _seed_default_auth_providers():
    """Upsert the default provider catalog — inserts missing entries on every startup."""
    from app.models import AuthProviderConfig

    session = SessionLocal()
    try:
        for provider_id, display_name, category, connection_url in _DEFAULT_AUTH_PROVIDERS:
            exists = session.query(AuthProviderConfig).filter(
                AuthProviderConfig.provider_type == provider_id
            ).first()
            if not exists:
                session.add(AuthProviderConfig(
                    id=str(uuid.uuid4()),
                    provider_type=provider_id,
                    name=display_name,
                    config="{}",
                    enabled=False,
                    category=category,
                    connection_url=connection_url,
                    status="ready",
                ))
        session.commit()
    finally:
        session.close()


def _seed_default_admin():
    """Create the first administrator only when no administrator exists."""
    from app.auth import hash_password
    from app.models import PlatformUser

    admin_email = os.getenv("PLATFORM_ADMIN_EMAIL", "admin@platform.local")
    admin_password = os.getenv("PLATFORM_ADMIN_PASSWORD", "")

    session = SessionLocal()
    try:
        if session.query(PlatformUser).filter(PlatformUser.role == "admin").count() != 0:
            return
        if not admin_password:
            raise RuntimeError(
                "PLATFORM_ADMIN_PASSWORD is required to bootstrap the first administrator"
            )
        if len(admin_password) < 12:
            raise RuntimeError("PLATFORM_ADMIN_PASSWORD must contain at least 12 characters")
        session.add(PlatformUser(
            user_id=str(uuid.uuid4()),
            email=admin_email,
            full_name="Platform Admin",
            role="admin",
            hashed_password=hash_password(admin_password),
            auth_provider="local",
            is_active=True,
        ))
        session.commit()
        _log.info("Initial platform administrator created email=%s", admin_email)
    finally:
        session.close()


def _validate_p0_mappings() -> None:
    """Block strict activation while projects or active CI tokens are unmapped."""
    from app.models import Organization, PlatformApiToken, Project, TokenProjectAccess
    from app.routes.analysis import PROFILE_CATALOG

    session = SessionLocal()
    try:
        organization_ids = {value for (value,) in session.query(Organization.id).all()}
        unmapped_projects = sum(
            1 for project in session.query(Project).all()
            if project.organization_id not in organization_ids
            or not project.analysis_profile_id
            or PROFILE_CATALOG.get(project.analysis_profile_id, {}).get("version")
            != project.analysis_profile_version
        )
        current_tokens = session.query(PlatformApiToken).filter(
            PlatformApiToken.is_current.is_(True),
            PlatformApiToken.revoked.is_(False),
        ).all()
        now = datetime.now(timezone.utc)
        active_tokens = []
        for token in current_tokens:
            expires_at = token.expires_at
            if expires_at and expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if not expires_at or expires_at > now:
                active_tokens.append(token)
        mapped_token_ids = {value for (value,) in session.query(TokenProjectAccess.token_id).distinct().all()}
        unmapped_tokens = 0
        for token in active_tokens:
            try:
                scopes = json.loads(token.scopes or "[]")
            except (TypeError, ValueError):
                scopes = []
            if token.token_id not in mapped_token_ids or not scopes:
                unmapped_tokens += 1
        if unmapped_projects or unmapped_tokens:
            raise RuntimeError(
                "P0 access mapping incomplete: "
                f"projects={unmapped_projects}, active_ci_tokens={unmapped_tokens}"
            )
    finally:
        session.close()


def get_session() -> Session:
    """Get database session for dependency injection."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
