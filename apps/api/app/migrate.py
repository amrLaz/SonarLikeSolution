"""One-shot database migration entrypoint for deployment and local startup."""

from app.db import migrate_db


if __name__ == "__main__":
    migrate_db()
