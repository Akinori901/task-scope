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
from enum import IntEnum
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

CLAUDE_PATH = shutil.which("claude") or "claude"
DEFAULT_MODEL = "sonnet"

# コードベース探索時に claude へ許可するツール。
#
# Skill: 対象リポジトリの .claude/skills/ に置かれた既存スキルをそのまま
#   使わせるために必要。スキルはリポジトリごとに異なるので、どれを使うかは
#   プロンプト側で列挙して指示する。
# Bash: git log / git blame 等で変更履歴を参照させ、生成物の精度を上げるために許可。
#
# 注意: Edit/Write は意図的に許可しない。生成はあくまで読み取りと文章生成であり、
# 対象リポジトリのワーキングツリーを書き換えてよい場面ではない。
# ただし Bash を許可した時点でホスト上で任意コマンドが実行可能になる点は
# 承知の上（このプロキシは開発者自身のマシンでのみ動かす前提）。
CODE_EXPLORATION_TOOLS = "Read,Glob,Grep,Skill,Bash"
MAX_TURNS = "25"


class ProxyTimeout(IntEnum):
    """Claude CLI 呼び出し（subprocess）のタイムアウト秒数。

    MAX 生成時間 = 10 分。コメントが多い/長文のチケットでは生成が数分かかるため
    余裕を持たせる。**backend 側（evaluation_service.HttpTimeout）より必ず小さくすること**。
    backend が proxy より先にタイムアウトすると、proxy 上で claude が孤児化する。
    """

    # cwd なし（テキストのみ生成）
    TEXT = 600  # 10 分
    # cwd あり（コードベース探索: Read/Glob/Grep, 最大25ターン）
    CODE_EXPLORATION = 600  # 10 分

    @classmethod
    def for_request(cls, cwd: str | None) -> int:
        return int(cls.CODE_EXPLORATION if cwd else cls.TEXT)


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
        cmd.extend(["--allowedTools", CODE_EXPLORATION_TOOLS, "--max-turns", MAX_TURNS])

    timeout = ProxyTimeout.for_request(cwd)

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


def _read_skill_meta(skill_md: Path) -> dict | None:
    """SKILL.md の frontmatter から name / description を読む。

    YAML パーサは使わない（プロキシは標準ライブラリのみで動かす方針）。
    frontmatter の単純な "key: value" 行だけを対象にする。
    """
    try:
        text = skill_md.read_text(encoding="utf-8")
    except OSError:
        return None

    if not text.startswith("---"):
        return None
    end = text.find("\n---", 3)
    if end == -1:
        return None

    meta: dict[str, str] = {}
    for line in text[3:end].splitlines():
        key, sep, value = line.partition(":")
        if not sep:
            continue
        key = key.strip()
        if key in {"name", "description"}:
            meta[key] = value.strip().strip("\"'")

    if "name" not in meta:
        meta["name"] = skill_md.parent.name
    return meta


# 親ディレクトリを何階層まで遡ってスキルを探すか。
# モノレポ的な配置（親に共通スキル、その配下の各サービスディレクトリが個別に
# スキルを持つ）で、子ディレクトリを repo として登録していても共通スキルを
# 拾えるようにする。
# Claude Code 自身も親を遡ってスキルを探すため、その挙動に揃える。
SKILL_SEARCH_PARENT_LEVELS = 3


def _collect_skills_in(skills_dir: Path, origin: str) -> list[dict]:
    """1 つの skills ディレクトリからスキルを列挙する。"""
    if not skills_dir.is_dir():
        return []

    found: list[dict] = []
    for entry in sorted(skills_dir.iterdir()):
        if not entry.is_dir():
            continue
        meta = _read_skill_meta(entry / "SKILL.md")
        if meta:
            meta["origin"] = origin
            found.append(meta)
    return found


def list_skills(root: Path) -> list[dict]:
    """root とその親ディレクトリの .claude/skills/*/SKILL.md を列挙する。

    root 自身を優先し、同名スキルは近い階層のものを採用する
    （子ディレクトリ側の上書きを尊重するため）。
    """
    root = root.resolve()
    candidates = [root, *list(root.parents)[:SKILL_SEARCH_PARENT_LEVELS]]

    found: list[dict] = []
    seen: set[str] = set()
    for base in candidates:
        origin = "self" if base == root else str(base)
        for meta in _collect_skills_in(base / ".claude" / "skills", origin):
            name = meta["name"]
            if name in seen:
                continue  # より近い階層のスキルを優先
            seen.add(name)
            found.append(meta)
    return found


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
        if self.path == "/list-skills":
            self._handle_list_skills(data)
            return
        if self.path == "/path-exists":
            self._handle_path_exists(data)
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

        # いずれのエンドポイントも同じ _handle_prompt を叩く。パスを分けるのは
        # 用途をログで区別するためと、将来エンドポイント別に挙動を変えられるように。
        prompt_paths = {
            "/evaluate",
            "/generate-spec",
            "/generate-qa",
            "/generate-report",   # 調査報告書
            "/generate-plan",     # 実装計画書
            "/generate-record",   # 実装/実行記録
            "/generate-completion",  # 完了コメント
        }
        if self.path in prompt_paths:
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

    def _handle_list_skills(self, data: dict) -> None:
        """指定ディレクトリで使えるスキル一覧を返す。

        スキルはリポジトリごとに異なるため、生成種別に固定のスキル名を
        割り当てるのではなく、実際に存在するものを都度拾う。
        """
        path = data.get("path")
        if not path:
            self._respond(400, {"error": "path is required"})
            return

        skills = list_skills(Path(path))
        self._respond(200, {"skills": skills})

    def _handle_path_exists(self, data: dict) -> None:
        """ホスト上にディレクトリが存在するかを返す。

        リポジトリのパスはホストの絶対パスなので、backend コンテナ内では
        判定できない。「パス不在」の判定はここで行う。
        """
        path = data.get("path")
        if not path:
            self._respond(400, {"error": "path is required"})
            return
        self._respond(200, {"exists": Path(path).is_dir()})

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

    # ThreadingHTTPServer: 各リクエストを別スレッドで処理する。
    # Claude CLI 呼び出しは数十秒〜数分かかるため、シングルスレッドだと
    # 並行リクエスト（QA生成 + 方針書生成 + 評価など）が直列化し、
    # Docker の host.docker.internal ゲートウェイが 504 で打ち切る。
    server = ThreadingHTTPServer(("0.0.0.0", args.port), ProxyHandler)
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
