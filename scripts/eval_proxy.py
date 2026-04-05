#!/usr/bin/env python3
"""
AI 評価プロキシサーバー

ホスト上で動作し、Claude Code CLI (サブスクリプション内) を使って
チケット評価・方針書生成を行う軽量 HTTP サーバー。

Usage:
    python scripts/eval_proxy.py              # デフォルト: port 19001
    python scripts/eval_proxy.py --port 19002 # ポート指定

Docker 内の Django バックエンドから host.docker.internal:19001 で呼び出される。
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

CLAUDE_PATH = shutil.which("claude") or "claude"
DEFAULT_MODEL = "sonnet"


def call_claude(prompt: str, model: str = DEFAULT_MODEL, max_tokens: int = 4096, cwd: str | None = None) -> str:
    """Claude Code CLI を呼び出してレスポンスを返す"""
    cmd = [
        CLAUDE_PATH,
        "-p", prompt,
        "--model", model,
        "--output-format", "text",
    ]

    # コード参照時はツール使用を許可し、複数ターンで探索させる
    if cwd:
        cmd.extend(["--allowedTools", "Read,Glob,Grep", "--max-turns", "25"])

    timeout = 600 if cwd else 300

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        cwd=cwd,
    )

    if result.returncode != 0:
        stderr = result.stderr or ""
        stdout = result.stdout.strip()

        # max-turns 到達時: 部分出力があればそれを返す + ガイダンス追記
        if "max turns" in stderr.lower() or "max_turns" in stderr.lower():
            guidance = (
                "\n\n---\n"
                "⚠️ **探索ターン上限に達しました**\n\n"
                "コードベースが大規模なため、プロキシ経由の自動探索では"
                "十分な調査ができませんでした。\n"
                "より詳細な方針書を作成するには、対象リポジトリで直接 "
                "Claude Code のスキル（`/implement` 等）を使い、"
                "コンテキストを与えた上で方針書を生成してください。\n\n"
                "**理由:** チケットの対象範囲が広く、関連ファイルの特定と"
                "コード構造の理解に多くの探索ステップが必要でした。"
            )
            if stdout:
                return stdout + guidance
            raise RuntimeError(
                "コード探索がターン上限(25)に達し、出力を生成できませんでした。"
                "対象リポジトリで直接 Claude Code を使って方針書を作成してください。"
            )

        raise RuntimeError(f"Claude CLI error (exit {result.returncode}): {stderr}")

    return result.stdout.strip()


class ProxyHandler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self._respond(400, {"error": "Invalid JSON"})
            return

        # prompt 不要なエンドポイントを先に処理
        if self.path == "/browse-dirs":
            self._handle_browse_dirs(data)
            return
        if self.path == "/health":
            self._respond(200, {"status": "ok"})
            return

        prompt = data.get("prompt", "")
        model = data.get("model", DEFAULT_MODEL)
        max_tokens = data.get("max_tokens", 4096)
        cwd = data.get("cwd")

        if not prompt:
            self._respond(400, {"error": "prompt is required"})
            return

        if self.path == "/evaluate":
            self._handle_prompt(prompt, model, max_tokens, cwd)
        elif self.path == "/generate-spec":
            self._handle_prompt(prompt, model, max_tokens, cwd)
        else:
            self._respond(404, {"error": "Not found"})

    def do_GET(self) -> None:
        if self.path == "/health":
            self._respond(200, {"status": "ok"})
        else:
            self._respond(404, {"error": "Not found"})

    def _handle_browse_dirs(self, data: dict) -> None:
        """ローカルディレクトリ一覧を返す"""
        path = data.get("path") or str(Path.home())
        p = Path(path)
        if not p.is_dir():
            self._respond(400, {"error": f"Not a directory: {path}"})
            return
        try:
            dirs = sorted([
                d.name for d in p.iterdir()
                if d.is_dir() and not d.name.startswith(".")
            ])
        except PermissionError:
            dirs = []
        resolved = p.resolve()
        parent = str(resolved.parent) if resolved.parent != resolved else None
        self._respond(200, {
            "current": str(resolved),
            "parent": parent,
            "dirs": dirs,
        })

    def _handle_prompt(self, prompt: str, model: str, max_tokens: int, cwd: str | None = None) -> None:
        try:
            response_text = call_claude(prompt, model, max_tokens, cwd=cwd)
            self._respond(200, {"text": response_text})
        except subprocess.TimeoutExpired:
            self._respond(504, {"error": "Claude CLI timed out"})
        except RuntimeError as e:
            self._respond(502, {"error": str(e)})
        except Exception as e:
            self._respond(500, {"error": str(e)})

    def _respond(self, status: int, data: dict) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def log_message(self, format: str, *args: object) -> None:
        print(f"[eval-proxy] {args[0]}" if args else "[eval-proxy]")


def main() -> None:
    parser = argparse.ArgumentParser(description="AI Evaluation Proxy")
    parser.add_argument("--port", type=int, default=19001, help="Listen port (default: 19001)")
    args = parser.parse_args()

    server = HTTPServer(("0.0.0.0", args.port), ProxyHandler)
    print(f"[eval-proxy] Listening on port {args.port}")
    print(f"[eval-proxy] Claude CLI: {CLAUDE_PATH}")
    print(f"[eval-proxy] Default model: {DEFAULT_MODEL}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[eval-proxy] Shutting down")
        server.shutdown()


if __name__ == "__main__":
    main()
