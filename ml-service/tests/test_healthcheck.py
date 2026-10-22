import io
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import MagicMock, patch

from crednexus_ml.healthcheck import check_http, check_worker, main, remove_worker_health, write_worker_health


class HealthcheckTests(unittest.TestCase):
    def test_worker_is_ready_only_with_fresh_live_process(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "health.json"
            write_worker_health(path, ready=True, runtime={"device": "cpu"})
            check_worker(path)
            self.assertEqual(json.loads(path.read_text())["pid"], os.getpid())
            self.assertEqual(list(Path(directory).glob("*.tmp")), [])
            with patch("crednexus_ml.healthcheck.os.kill", side_effect=ProcessLookupError):
                with self.assertRaises(ProcessLookupError):
                    check_worker(path)
            remove_worker_health(path)
            self.assertFalse(path.exists())

    def test_stale_false_future_invalid_and_missing_worker_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "health.json"
            base = {"pid": os.getpid(), "ready": True, "updated_at": time.time()}
            for changes in ({"updated_at": time.time()-31}, {"updated_at": time.time()+10}, {"ready": False},
                            {"updated_at": float("nan")}, {"updated_at": True}, {"pid": -1}, {"pid": True}):
                path.write_text(json.dumps(base | changes))
                with self.subTest(changes=changes), self.assertRaises(ValueError):
                    check_worker(path)
            path.write_text("invalid json")
            with self.assertRaises(ValueError):
                check_worker(path)
            path.unlink()
            with self.assertRaises(FileNotFoundError):
                check_worker(path)

    def test_cleanup_does_not_remove_another_workers_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "health.json"
            path.write_text(json.dumps({"pid": os.getpid()+1000000}))
            remove_worker_health(path)
            self.assertTrue(path.exists())
            path.write_text("invalid json")
            remove_worker_health(path)

    def test_http_requires_ready_not_just_http_200(self):
        for status in ("ready", "alive"):
            response = io.BytesIO(json.dumps({"status": status}).encode())
            response.status = 200
            opener = MagicMock()
            opener.open.return_value.__enter__.return_value = response
            with patch("crednexus_ml.healthcheck.urllib.request.build_opener", return_value=opener):
                if status == "ready":
                    check_http("http://127.0.0.1/health/ready")
                else:
                    with self.assertRaises(ValueError):
                        check_http("http://127.0.0.1/health/ready")

    def test_cli_failure_is_nonzero_without_exposing_error(self):
        with patch("sys.argv", ["healthcheck", "http"]), patch("crednexus_ml.healthcheck.check_http", side_effect=OSError("secret")):
            with self.assertRaises(SystemExit) as error:
                main()
            self.assertEqual(error.exception.code, 1)
        with patch("sys.argv", ["healthcheck", "worker", "--file", "/missing"]), patch("crednexus_ml.healthcheck.check_worker") as probe:
            main()
            probe.assert_called_once_with(Path("/missing"))
