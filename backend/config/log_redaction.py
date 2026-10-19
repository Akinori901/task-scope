"""ログに秘密が載らないよう、出力直前に伏せる。

Backlog API はキーをクエリ文字列（apiKey=...）で渡す仕様のため、URL を含む行に
キーがそのまま載る。httpx は INFO でリクエスト URL を出し、raise_for_status の
例外メッセージにも URL が入るので、ログ設定で個別に抑えるだけでは漏れる。
整形後の文字列（例外のトレースバックを含む）をまとめて伏せる。
"""

from __future__ import annotations

import logging
import re

_PATTERNS = [
    # Backlog: ?apiKey=xxx / &apiKey=xxx（URL エンコード後の %3D も）
    re.compile(r"(?i)(apiKey(?:=|%3D))[^&\s'\"]+"),
    # 内部トークン（body の "token" をログに出した場合の保険）
    re.compile(r"(?i)(['\"]token['\"]\s*:\s*['\"])[^'\"]+"),
]


def redact(text: str) -> str:
    for pattern in _PATTERNS:
        text = pattern.sub(r"\1***", text)
    return text


class RedactingFormatter(logging.Formatter):
    """logging.Formatter の出力から秘密を伏せる。"""

    def format(self, record: logging.LogRecord) -> str:
        return redact(super().format(record))
