"""
ST.AIRS — Database Connection
Using asyncpg for async PostgreSQL operations
Compatible with Railway, Docker, and local dev
"""

import asyncpg
import os
from typing import Optional


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://stairs@localhost:5432/stairs"
)

_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        db_url = DATABASE_URL
        # Railway/Heroku use postgres:// but asyncpg needs postgresql://
        if db_url.startswith("postgres://"):
            db_url = db_url.replace("postgres://", "postgresql://", 1)

        _pool = await asyncpg.create_pool(
            db_url,
            min_size=2,
            max_size=10,
            command_timeout=60
        )
    return _pool


async def get_conn():
    """Get a connection from the pool"""
    pool = await get_pool()
    return pool


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def _find_schema_sql() -> Optional[str]:
    """Find schema.sql — works in Docker, Railway Nixpacks, and local dev"""
    candidates = [
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "schema.sql"),
        os.path.join(os.getcwd(), "schema.sql"),
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "schema.sql"),
    ]
    for path in candidates:
        resolved = os.path.abspath(path)
        if os.path.exists(resolved):
            return resolved
    return None


async def init_db():
    """Initialize database with schema if tables don't exist"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'stairs'
            )
        """)
        if not exists:
            schema_path = _find_schema_sql()
            if schema_path:
                schema_sql = open(schema_path).read()
                await conn.execute(schema_sql)
                print(f"✅ Database schema initialized from {schema_path}")
            else:
                print("⚠️ Schema file not found — create tables manually")
        else:
            print("✅ Database already initialized")
