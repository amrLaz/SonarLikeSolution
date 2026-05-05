"""Database connection and session management."""

import os
from sqlalchemy import create_engine
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


def init_db():
    """Initialize database (create tables if needed)."""
    from app.models import Base
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print(f"Error initializing database: {e}")


def get_session() -> Session:
    """Get database session for dependency injection."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
