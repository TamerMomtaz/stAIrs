"""
Test configuration for Stairs backend.
Uses httpx async client with FastAPI's TestClient.
"""

import os
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

# Set test env vars before importing app
os.environ["DATABASE_URL"] = "postgresql://test:test@localhost:5432/test_stairs"
os.environ["JWT_SECRET"] = "test-secret-for-testing-only-not-for-prod"
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["ALLOWED_ORIGINS"] = "http://localhost:3000"


@pytest.fixture
def mock_pool():
    """Mock asyncpg connection pool."""
    pool = AsyncMock()
    conn = AsyncMock()
    pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)
    return pool, conn
