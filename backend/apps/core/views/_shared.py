"""views の共通部品（クエリパラメータの解釈・バックグラウンドタスクの状態）"""

from __future__ import annotations

import logging
import threading
from typing import TYPE_CHECKING, Any

from rest_framework.exceptions import ValidationError

if TYPE_CHECKING:
    from collections.abc import Mapping


logger = logging.getLogger(__name__)


# バックグラウンドタスク管理（方針書生成・評価など）
_bg_tasks: dict[str, dict[str, Any]] = {}


_bg_tasks_lock = threading.Lock()


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
