from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from backend.core.config import settings

# If config uses aiosqlite, replace it with sync sqlite for sync repository compatibility
db_url = settings.DATABASE_URL
if db_url.startswith("sqlite+aiosqlite"):
    db_url = db_url.replace("sqlite+aiosqlite", "sqlite")

# Create engine and session factory
engine = create_engine(
    db_url,
    echo=False,
    connect_args={"check_same_thread": False} if db_url.startswith("sqlite") else {}
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False
)

def get_db_session() -> Generator[Session, None, None]:
    """Dependency for FastAPI to get a database session."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()

@contextmanager
def get_session_context() -> Generator[Session, None, None]:
    """Context manager for getting a database session outside of FastAPI requests."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
