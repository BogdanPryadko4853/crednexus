import asyncio
from contextlib import asynccontextmanager
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

import httpx

from crednexus_backend.api import create_app
from crednexus_backend.config import Settings
from crednexus_backend.readiness import DATABASE_REVISION, check_database
from crednexus_backend.worker import Worker
from crednexus_ml.healthcheck import check_worker


class ReadinessTests(unittest.IsolatedAsyncioTestCase):
    async def test_revision_mismatch_and_timeout(self):
        for value in (DATABASE_REVISION, "old_revision", TimeoutError()):
            scalar = AsyncMock(side_effect=value) if isinstance(value, Exception) else AsyncMock(return_value=value)
            @asynccontextmanager
            async def session():
                yield SimpleNamespace(scalar=scalar)
            database = SimpleNamespace(sessions=session)
            if value == DATABASE_REVISION:
                self.assertEqual(await check_database(database), DATABASE_REVISION)
            else:
                with self.assertRaises((ValueError, TimeoutError)):
                    await check_database(database)

    async def test_http_readiness_unavailable_when_database_fails(self):
        app = create_app(Settings("postgresql+asyncpg://test@localhost/unused", "internal-key-for-tests"))
        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                with patch("crednexus_backend.api.check_database", side_effect=ConnectionRefusedError):
                    self.assertEqual((await client.get("/health/ready")).status_code, 503)
                    self.assertEqual((await client.get("/health/live")).status_code, 200)

    async def test_worker_health_tracks_database_and_loop_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "worker.json"
            runtime = SimpleNamespace(as_dict=lambda: {"device": "cpu", "provider": "CPUExecutionProvider"})
            worker = Worker(None, SimpleNamespace(runtime=runtime), None)
            for database_ok, loop_ok in ((True, True), (False, True), (True, False)):
                worker.healthy = loop_ok
                stopping = asyncio.Event()
                async def database_check(_database):
                    stopping.set()
                    if not database_ok:
                        raise ConnectionRefusedError
                    return DATABASE_REVISION
                with patch("crednexus_backend.worker.check_database", side_effect=database_check):
                    await worker.health_pulse(path, stopping)
                self.assertEqual(json.loads(path.read_text())["ready"], database_ok and loop_ok)
                if database_ok and loop_ok:
                    check_worker(path)
                else:
                    with self.assertRaises(ValueError):
                        check_worker(path)
