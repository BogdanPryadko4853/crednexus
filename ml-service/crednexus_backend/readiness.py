"""Bounded checks shared by backend readiness and the worker health pulse."""
import asyncio

from sqlalchemy import text

DATABASE_REVISION = "0001_backend"


async def check_database(database):
    async with asyncio.timeout(3):
        async with database.sessions() as session:
            revision = await session.scalar(text("SELECT version_num FROM alembic_version"))
            if revision != DATABASE_REVISION:
                raise ValueError("Database migrations are not current")
    return revision
