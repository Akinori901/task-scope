"""views の共通部品（クエリパラメータの解釈・バックグラウンドタスクの状態）"""

from __future__ import annotations

import logging
import threading
from typing import TYPE_CHECKING, Any

from rest_framework.exceptions import ValidationError

if TYPE_CHECKING:
    from collections.abc import Mapping

    from rest_framework.request import Request


logger = logging.getLogger(__name__)


# バックグラウンドタスク管理（方針書生成・評価など）
_bg_tasks: dict[str, dict[str, Any]] = {}


_bg_tasks_lock = threading.Lock()


def _body(request: Request) -> dict[str, Any]:
    """リクエスト本文を dict で取り出す。

    request.data は JSON の配列も受け付けるため、そのまま .get すると 500 になる。
    オブジェクト以外は 400 で返す（フォーム送信の QueryDict は dict のサブクラスなので通る）。
    """
    data = request.data
    if not isinstance(data, dict):
        raise ValidationError({"detail": "リクエスト本文は JSON オブジェクトで送ってください"})
    return data


def _int_param(params: Mapping[str, str], name: str) -> int | None:
    """ID の絞り込みに使うクエリパラメータを整数で取り出す。未指定なら None。

    文字列のまま ORM に渡すと、数字でない値（?space=abc）で 500 になっていた。
    不正な値は 400 で返す。
    """
    raw = params.get(name)
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError as err:
        raise ValidationError({name: "整数で指定してください"}) from err
