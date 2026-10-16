"""eval_proxy の呼び出し元制限のテスト。

proxy は標準ライブラリのみで動かす方針なので、テストも unittest で書く。
claude CLI は呼ばない（subprocess.run を差し替える）。

    python3 -m unittest discover -s scripts/tests
"""

from __future__ import annotations

import http.client
import json
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import eval_proxy


class _Completed:
    returncode = 0
    stdout = "generated"
    stderr = ""


class ProxyServerTestCase(unittest.TestCase):
    token = ""

    def setUp(self) -> None:
        patcher = mock.patch.object(eval_proxy, "PROXY_TOKEN", self.token)
        patcher.start()
        self.addCleanup(patcher.stop)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), eval_proxy.ProxyHandler)
        self.port = self.server.server_address[1]
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def request(
        self,
        method: str,
        path: str,
        body: object | None = None,
        *,
        host: str = "localhost",
        content_type: str = "application/json",
        headers: dict[str, str] | None = None,
    ) -> tuple[int, dict[str, str], dict]:
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        payload = json.dumps(body).encode() if body is not None else None
        sent = {"Host": host, **(headers or {})}
        if payload is not None:
            sent["Content-Type"] = content_type
        conn.request(method, path, body=payload, headers=sent)
        resp = conn.getresponse()
        data = json.loads(resp.read() or b"{}")
        result = resp.status, {k.lower(): v for k, v in resp.getheaders()}, data
        conn.close()
        return result


class BrowserOriginTests(ProxyServerTestCase):
    def test_health_from_localhost(self) -> None:
        status, _, data = self.request("GET", "/health")
        self.assertEqual(status, 200)
        self.assertEqual(data, {"status": "ok"})

    def test_docker_host_header_is_allowed(self) -> None:
        status, _, _ = self.request("POST", "/path-exists", {"path": "/"}, host="host.docker.internal:19001")
        self.assertEqual(status, 200)

    def test_rebinding_host_header_is_rejected(self) -> None:
        status, _, _ = self.request("POST", "/path-exists", {"path": "/"}, host="attacker.example:19001")
        self.assertEqual(status, 403)

    def test_text_plain_simple_request_is_rejected(self) -> None:
        status, _, _ = self.request("POST", "/path-exists", {"path": "/"}, content_type="text/plain")
        self.assertEqual(status, 415)

    def test_no_cors_header(self) -> None:
        _, headers, _ = self.request("GET", "/health")
        self.assertNotIn("access-control-allow-origin", headers)

    def test_non_object_json_is_rejected(self) -> None:
        status, _, _ = self.request("POST", "/path-exists", [1, 2])
        self.assertEqual(status, 400)

    def test_oversized_body_is_rejected(self) -> None:
        with mock.patch.object(eval_proxy, "MAX_BODY_BYTES", 10):
            status, _, _ = self.request("POST", "/path-exists", {"path": "/" * 20})
        self.assertEqual(status, 413)


class TokenTests(ProxyServerTestCase):
    token = "test-token"

    def test_missing_token_is_rejected(self) -> None:
        status, _, _ = self.request("POST", "/path-exists", {"path": "/"})
        self.assertEqual(status, 401)

    def test_wrong_token_is_rejected(self) -> None:
        status, _, _ = self.request(
            "POST", "/path-exists", {"path": "/"}, headers={eval_proxy.TOKEN_HEADER: "wrong"}
        )
        self.assertEqual(status, 401)

    def test_correct_token_is_accepted(self) -> None:
        status, _, data = self.request(
            "POST", "/path-exists", {"path": "/"}, headers={eval_proxy.TOKEN_HEADER: self.token}
        )
        self.assertEqual(status, 200)
        self.assertEqual(data, {"exists": True})

    def test_health_does_not_require_token(self) -> None:
        status, _, _ = self.request("GET", "/health")
        self.assertEqual(status, 200)


class AllowedToolsTests(unittest.TestCase):
    def _tools_for(self, allow_bash: bool) -> str:
        with mock.patch.object(eval_proxy, "ALLOW_BASH", allow_bash), mock.patch.object(
            eval_proxy.subprocess, "run", return_value=_Completed()
        ) as run:
            eval_proxy.call_claude("prompt", cwd="/tmp")
        cmd = run.call_args.args[0]
        return cmd[cmd.index("--allowedTools") + 1]

    def test_bash_is_disabled_by_default(self) -> None:
        self.assertNotIn("Bash", self._tools_for(allow_bash=False).split(","))

    def test_bash_is_added_when_opted_in(self) -> None:
        self.assertIn("Bash", self._tools_for(allow_bash=True).split(","))

    def test_no_tools_without_cwd(self) -> None:
        with mock.patch.object(eval_proxy.subprocess, "run", return_value=_Completed()) as run:
            eval_proxy.call_claude("prompt")
        self.assertNotIn("--allowedTools", run.call_args.args[0])


class LoadSettingsTests(unittest.TestCase):
    def test_reads_only_eval_proxy_keys_and_env_wins(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            env_file = Path(d) / ".env"
            env_file.write_text(
                'MYSQL_PASSWORD=secret\nEVAL_PROXY_TOKEN="from-file"\nEVAL_PROXY_HOST=172.17.0.1\n',
                encoding="utf-8",
            )
            with mock.patch.dict(eval_proxy.os.environ, {"EVAL_PROXY_HOST": "127.0.0.1"}, clear=True):
                settings = eval_proxy.load_settings(env_file)
        self.assertEqual(settings, {"EVAL_PROXY_TOKEN": "from-file", "EVAL_PROXY_HOST": "127.0.0.1"})

    def test_missing_file_is_ok(self) -> None:
        with mock.patch.dict(eval_proxy.os.environ, {}, clear=True):
            self.assertEqual(eval_proxy.load_settings(Path("/nonexistent/.env")), {})


class HostNameTests(unittest.TestCase):
    def test_parses_host_variants(self) -> None:
        cases = {
            "localhost:19001": "localhost",
            "HOST.DOCKER.INTERNAL:19001": "host.docker.internal",
            "[::1]:19001": "::1",
            "127.0.0.1": "127.0.0.1",
        }
        for header, expected in cases.items():
            with self.subTest(header=header):
                self.assertEqual(eval_proxy._host_name(header), expected)


if __name__ == "__main__":
    unittest.main()
