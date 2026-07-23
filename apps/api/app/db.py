"""Database connection and session management."""

import logging
import os
import secrets
import uuid
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


def init_db():
    """Initialize database (create tables if needed)."""
    from app.models import Base
    try:
        Base.metadata.create_all(bind=engine)
        with engine.begin() as connection:
            for statement in _SCHEMA_PATCHES:
                connection.execute(text(statement))
        _seed_default_auth_providers()
        _seed_default_admin()
    except Exception as e:
        print(f"Error initializing database: {e}")


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
    """Sync the platform admin account from environment variables on every startup.

    - If PLATFORM_ADMIN_PASSWORD is set: always upsert the admin (create or update
      password). This means changing env vars + restarting the app is enough to
      reset credentials — no manual DB access needed.
    - If not set: only seed once when platform_users is completely empty.
    """
    from app.auth import hash_password
    from app.models import PlatformUser

    admin_email = os.getenv("PLATFORM_ADMIN_EMAIL", "admin@platform.local")
    admin_password = os.getenv("PLATFORM_ADMIN_PASSWORD", "")

    session = SessionLocal()
    try:
        if admin_password:
            # Env var set — upsert on every startup so credentials stay in sync
            user = session.query(PlatformUser).filter(PlatformUser.email == admin_email).first()
            if user:
                user.hashed_password = hash_password(admin_password)
                user.role = "admin"
                user.is_active = True
                session.commit()
                print(f"[RBAC] Admin synced from env: {admin_email}")
            else:
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
                print(f"[RBAC] Admin created from env: {admin_email}")
        else:
            # No env var — seed only once when table is empty
            if session.query(PlatformUser).count() > 0:
                return
            generated = secrets.token_urlsafe(12)
            print(f"[RBAC] No PLATFORM_ADMIN_PASSWORD set — generated password for {admin_email}: {generated}")
            session.add(PlatformUser(
                user_id=str(uuid.uuid4()),
                email=admin_email,
                full_name="Platform Admin",
                role="admin",
                hashed_password=hash_password(generated),
                auth_provider="local",
                is_active=True,
            ))
            session.commit()
            print(f"[RBAC] Default admin created: {admin_email}")
    finally:
        session.close()


def get_session() -> Session:
    """Get database session for dependency injection."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
