"""ログに Backlog の API キーを残さないことの検証。

Backlog API はキーをクエリ（apiKey=...）で渡すため、httpx の INFO ログや
raise_for_status の例外メッセージにキーが平文で載る。
"""

from __future__ import annotations

import logging

from config.log_redaction import RedactingFormatter, redact


class Testログの秘密:
    KEY = "AbCdEf0123456789"

    def test_BacklogのapiKeyを伏せる(self) -> None:
        line = f"HTTP Request: GET https://x.backlog.com/api/v2/issues?apiKey={self.KEY}&count=100"

        out = redact(line)

        assert self.KEY not in out
        assert "apiKey=***&count=100" in out

    def test_URLエンコード後も伏せる(self) -> None:
        assert self.KEY not in redact(f"url=https%3A%2F%2Fx%3FapiKey%3D{self.KEY}")

    def test_例外のトレースバックに入ったキーも伏せる(self) -> None:
        """raise_for_status の例外メッセージには URL が丸ごと入る。"""
        formatter = RedactingFormatter("{message}", style="{")
        import sys

        try:
            raise RuntimeError(f"Client error '404' for url 'https://x/api?apiKey={self.KEY}'")
        except RuntimeError:
            record = logging.LogRecord("t", logging.ERROR, __file__, 1, "sync failed", None, sys.exc_info())

        assert self.KEY not in formatter.format(record)

    def test_httpxのINFOは出さない(self) -> None:
        """httpx は INFO でリクエスト URL（= キー入り）を出す。"""
        assert logging.getLogger("httpx").getEffectiveLevel() >= logging.WARNING
