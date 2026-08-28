import pytest
import asyncio
from backend.app.core.database import init_db
from backend.app.core.redis import redis_manager
from backend.app.seed import seed_database


@pytest.fixture(scope="session", autouse=True)
async def setup_test_database():
    """Initializes and seeds database and Redis manager for test runs."""
    await init_db()
    await seed_database()
    await redis_manager.initialize()
