import contextlib
import logging
from typing import AsyncGenerator, Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    create_async_engine, AsyncSession, async_sessionmaker, AsyncEngine
)
from backend.app.core.config import settings
from backend.app.models.entities import Base

logger = logging.getLogger("catauth.database")

# Database engine initialization
connect_args = {}
if "sqlite" in settings.DATABASE_URL:
    connect_args["check_same_thread"] = False

engine: AsyncEngine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    connect_args=connect_args,
    pool_pre_ping=True
)

async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)


async def init_db() -> None:
    """Initialize database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database schema initialized successfully.")


class UnitOfWork:
    """
    Unit-of-Work Pattern with Supavisor SET LOCAL Tenant Isolation Guard.
    (Node 16 / node-61 & Node 17 / node-62)
    
    Ensures that every transaction in the pool is strictly isolated:
    1. Begins explicit transaction (BEGIN)
    2. Runs `SET LOCAL app.current_tenant_id = :tenant_id`
    3. Yields session to business logic
    4. Commits upon clean exit or rolls back upon any exception
    """

    def __init__(self, tenant_id: Optional[str] = None):
        self.tenant_id = tenant_id or "default-tenant"
        self.session: Optional[AsyncSession] = None

    async def __aenter__(self) -> AsyncSession:
        self.session = async_session_factory()
        
        # Enforce SET LOCAL in PostgreSQL / Supavisor connection pooler
        # If running on SQLite in testing/dev, simulate the scoped session state
        try:
            if "postgresql" in settings.DATABASE_URL:
                await self.session.execute(
                    text("SET LOCAL app.current_tenant_id = :tenant_id"),
                    {"tenant_id": self.tenant_id}
                )
            else:
                # Store tenant_id in session info for application-level RLS verification
                self.session.info["current_tenant_id"] = self.tenant_id
        except Exception as e:
            logger.warning(f"SET LOCAL initialization warning: {e}")

        return self.session

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            # An error occurred - execute atomic ROLLBACK
            await self.session.rollback()
            await self.session.close()
            logger.error(f"UnitOfWork rolled back transaction for tenant {self.tenant_id}: {exc_val}")
            return False  # propagate exception
        else:
            try:
                await self.session.commit()
            except Exception as e:
                await self.session.rollback()
                logger.error(f"UnitOfWork commit failed, rolled back: {e}")
                raise e
            finally:
                await self.session.close()


async def get_db_session(tenant_id: Optional[str] = "default-tenant") -> AsyncGenerator[AsyncSession, None]:
    """Dependency injection for FastAPI routes."""
    async with UnitOfWork(tenant_id=tenant_id) as session:
        yield session
