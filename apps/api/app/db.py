"""Database connection and session management."""

import os
import uuid
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session

# Always construct DATABASE_URL from individual variables to ensure correct hostname
# Convert old hostname 'db' to the correct Docker service name
postgres_host = os.getenv("POSTGRES_HOST", "newsastproject-db-1")
if postgres_host == "db":
    postgres_host = "newsastproject-db-1"

DB_HOST = os.getenv("DB_HOST", postgres_host)
DB_PORT = os.getenv("DB_PORT", os.getenv("POSTGRES_PORT", "5432"))
DB_USER = os.getenv("DB_USER", os.getenv("POSTGRES_USER", "sast_user"))
DB_PASSWORD = os.getenv("DB_PASSWORD", os.getenv("POSTGRES_PASSWORD", "sast_pass"))
DB_NAME = os.getenv("DB_NAME", os.getenv("POSTGRES_DB", "sast_db"))

# Use psycopg:// instead of postgresql:// for psycopg3
DATABASE_URL = f"postgresql+psycopg://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

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
]

# Default authentication provider catalog, seeded once if the table is empty -
# mirrors SonarQube, which always lists available providers even when disabled.
_DEFAULT_AUTH_PROVIDERS = [
    ("saml", "SAML 2.0", "Enterprise SSO", ""),
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
    except Exception as e:
        print(f"Error initializing database: {e}")


def _seed_default_auth_providers():
    """Insert the default provider catalog if no provider rows exist yet."""
    from app.models import AuthProviderConfig

    session = SessionLocal()
    try:
        if session.query(AuthProviderConfig).count() > 0:
            return
        for provider_id, display_name, category, connection_url in _DEFAULT_AUTH_PROVIDERS:
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


def get_session() -> Session:
    """Get database session for dependency injection."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
