#!/usr/bin/env python3
"""
AI 評価プロキシサーバー

ホスト上で動作し、Claude Code CLI (サブスクリプション内) を使って
チケット評価・方針書生成を行う軽量 HTTP サーバー。

Usage:
    python scripts/eval_proxy.py              # デフォルト: port 19001
    python scripts/eval_proxy.py --port 19002 # ポート指定
    python scripts/eval_proxy.py --host 172.17.0.1  # Linux の Docker Engine 向け

Docker 内の Django バックエンドから host.docker.internal:19001 で呼び出される。
"""

from __future__ import annotations

import argparse
import hmac
import json
import os
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
#
# 注意: Edit/Write は意図的に許可しない。生成はあくまで読み取りと文章生成であり、
# 対象リポジトリのワーキングツリーを書き換えてよい場面ではない。
CODE_EXPLORATION_TOOLS = "Read,Glob,Grep,Skill"

# Bash は EVAL_PROXY_ALLOW_BASH=1 のときだけ追加する（git log / git blame で精度が上がる）。
# 既定で外すのは、プロンプトに Backlog / Jira のチケット本文とコメント（第三者が書いた文章）が
# そのまま入るため。Bash があると、本文に仕込まれた指示（プロンプトインジェクション）で
# ホスト上の任意コマンドが実行されうる。
ALLOW_BASH = False
MAX_TURNS = "25"

# ブラウザ経由の呼び出しを拒否するための Host ヘッダ許可リスト。
# 閲覧中の悪意あるページが DNS rebinding で自分のドメインを 127.0.0.1 に向けても、
# Host ヘッダは攻撃者のドメインのままなのでここで弾ける。
# backend は host.docker.internal、make eval-proxy-status は localhost で来る。
ALLOWED_HOSTS = frozenset({"localhost", "127.0.0.1", "::1", "host.docker.internal"})

# プロンプトはチケット本文とコメントを含むが、1MB を超えることはない。
MAX_BODY_BYTES = 1024 * 1024

TOKEN_HEADER = "X-Eval-Proxy-Token"
LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})


def load_settings(env_file: Path) -> dict[str, str]:
    """EVAL_PROXY_* の設定を環境変数と .env から読む（環境変数が優先）。

    backend は docker compose の env_file で同じ .env を読むので、
    トークンを .env に 1 回書けば proxy と backend の両方に効く。
    .env の他の値（DB パスワード等）は読まない。
    """
    found: dict[str, str] = {}
    try:
        lines = env_file.read_text(encoding="utf-8").splitlines()
    except OSError:
        lines = []
    for line in lines:
        key, sep, value = line.strip().partition("=")
        if sep and key.startswith("EVAL_PROXY_"):
            found[key] = value.strip().strip("\"'")
    found.update({k: v for k, v in os.environ.items() if k.startswith("EVAL_PROXY_")})
    return found


# main() で設定する。空なら認証なし（ループバック待ち受け時のみ許容）。
PROXY_TOKEN = ""


def _host_name(header: str) -> str:
    """Host ヘッダからポートを除いたホスト名を返す（IPv6 の [::1]:port にも対応）。"""
    host = header.strip().lower()
    if host.startswith("["):
        end = host.find("]")
        return host[1:end] if end != -1 else host
    if host.count(":") == 1:
        return host.rsplit(":", 1)[0]
    return host


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
        tools = CODE_EXPLORATION_TOOLS + (",Bash" if ALLOW_BASH else "")
        cmd.extend(["--allowedTools", tools, "--max-turns", MAX_TURNS])

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
    def _guard(self, *, require_json: bool) -> bool:
        """ブラウザ経由・想定外の呼び出し元を弾く。通してよければ True。

        Content-Type を application/json に限るのは、ブラウザが text/plain の
        simple request ならプリフライトなしで送れてしまうため。application/json は
        プリフライトが必須で、このプロキシは CORS ヘッダを返さないので通らない。
        """
        if _host_name(self.headers.get("Host", "")) not in ALLOWED_HOSTS:
            self._respond(403, {"error": "Host not allowed"})
            return False
        if require_json:
            content_type = self.headers.get("Content-Type", "").split(";")[0].strip().lower()
            if content_type != "application/json":
                self._respond(415, {"error": "Content-Type must be application/json"})
                return False
            # /health（GET）は make eval-proxy-status から叩くのでトークン不要。
            if PROXY_TOKEN and not hmac.compare_digest(
                self.headers.get(TOKEN_HEADER, "").encode(), PROXY_TOKEN.encode()
            ):
                self._respond(401, {"error": "Invalid or missing token"})
                return False
        return True

    def _discard_body(self, length: int) -> None:
        """未読の本文を読み捨てる。

        本文を残したまま応答して接続を閉じると、送信途中のクライアントには
        401/415 ではなく connection reset が返ってしまう（原因が分かりにくい）。
        極端に大きい本文は読み捨てずに閉じる。
        """
        remaining = min(length, MAX_BODY_BYTES * 8)
        while remaining > 0:
            chunk = self.rfile.read(min(remaining, 64 * 1024))
            if not chunk:
                break
            remaining -= len(chunk)

    def do_POST(self) -> None:
        try:
            content_length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            self.close_connection = True
            self._respond(400, {"error": "Invalid Content-Length"})
            return
        if content_length > MAX_BODY_BYTES:
            self._discard_body(content_length)
            self.close_connection = True
            self._respond(413, {"error": "Request body too large"})
            return
        body = self.rfile.read(content_length)

        # 本文を読み切ってから判定する（_discard_body の理由と同じ）。
        if not self._guard(require_json=True):
            return

        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self._respond(400, {"error": "Invalid JSON"})
            return
        if not isinstance(data, dict):
            self._respond(400, {"error": "JSON object is required"})
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
        if not self._guard(require_json=False):
            return
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
        # Access-Control-Allow-Origin は付けない。呼び出し元は backend（サーバー間通信）
        # だけで、ブラウザから直接叩かせる理由がないため。
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def log_message(self, format: str, *args: object) -> None:
        print(f"[eval-proxy] {args[0]}" if args else "[eval-proxy]")


def main() -> None:
    global PROXY_TOKEN, ALLOW_BASH
    settings = load_settings(Path(__file__).resolve().parent.parent / ".env")
    PROXY_TOKEN = settings.get("EVAL_PROXY_TOKEN", "")
    ALLOW_BASH = settings.get("EVAL_PROXY_ALLOW_BASH", "") == "1"

    parser = argparse.ArgumentParser(description="AI Evaluation Proxy")
    parser.add_argument("--port", type=int, default=19001, help="Listen port (default: 19001)")
    # 既定はループバックのみ。0.0.0.0 だと同じ LAN の他端末から生成エンドポイントを
    # 叩けてしまう。Docker Desktop (Mac/Windows) は host.docker.internal 宛てを
    # ホストのループバックに転送するので、これで backend コンテナから届く。
    # Linux の Docker Engine では docker0 のアドレス（例: 172.17.0.1）を指定する。
    parser.add_argument(
        "--host",
        default=settings.get("EVAL_PROXY_HOST", "127.0.0.1"),
        help="Listen address (default: 127.0.0.1, env: EVAL_PROXY_HOST)",
    )
    args = parser.parse_args()

    if args.host not in LOOPBACK_HOSTS and not PROXY_TOKEN:
        sys.exit(
            f"[eval-proxy] {args.host} で待ち受けるには EVAL_PROXY_TOKEN が必要です。"
            " .env に EVAL_PROXY_TOKEN=<ランダムな文字列> を設定してください"
            "（例: python3 -c 'import secrets; print(secrets.token_urlsafe(32))'）"
        )

    # ThreadingHTTPServer: 各リクエストを別スレッドで処理する。
    # Claude CLI 呼び出しは数十秒〜数分かかるため、シングルスレッドだと
    # 並行リクエスト（QA生成 + 方針書生成 + 評価など）が直列化し、
    # Docker の host.docker.internal ゲートウェイが 504 で打ち切る。
    server = ThreadingHTTPServer((args.host, args.port), ProxyHandler)
    print(f"[eval-proxy] Listening on {args.host}:{args.port}")
    print(f"[eval-proxy] Token auth: {'on' if PROXY_TOKEN else 'off (loopback only)'}")
    print(f"[eval-proxy] Bash tool: {'allowed' if ALLOW_BASH else 'disabled'}")
    print(f"[eval-proxy] Claude CLI: {CLAUDE_PATH}")
    print(f"[eval-proxy] Default model: {DEFAULT_MODEL}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[eval-proxy] Shutting down")
        server.shutdown()


if __name__ == "__main__":
    main()
