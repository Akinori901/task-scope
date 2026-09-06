from __future__ import annotations

from rest_framework.pagination import PageNumberPagination


class DefaultPagination(PageNumberPagination):
    """既定のページネーション。

    フロントが `?page_size=` を送ればそれを尊重する（例: チケット一覧は 20 件/ページ）。
    未指定時は従来どおり PAGE_SIZE（settings, 50）を使う。過大な値を防ぐため上限を設ける。
    """

    page_size_query_param = "page_size"
    max_page_size = 200
