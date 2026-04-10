from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class BacklogClient:
    """Backlog API v2 非同期クライアント"""

    def __init__(self, base_url: str, api_key: str) -> None:
        self.base_url = base_url
        self.api_key = api_key
        self._client = httpx.AsyncClient(timeout=30.0)

    async def close(self) -> None:
        await self._client.aclose()

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        url = f"{self.base_url}{path}"
        request_params: dict[str, Any] = {"apiKey": self.api_key}
        if params:
            request_params.update(params)

        response = await self._client.get(url, params=request_params)
        response.raise_for_status()
        # レート制限対応
        await asyncio.sleep(0.2)
        return response.json()

    async def get_myself(self) -> dict[str, Any]:
        result: dict[str, Any] = await self._get("/users/myself")
        return result

    async def get_projects(self) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = await self._get("/projects", params={"archived": "false"})
        return result

    async def get_issues(
        self,
        project_id: int,
        offset: int = 0,
        count: int = 100,
    ) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = await self._get(
            "/issues",
            params={
                "projectId[]": project_id,
                "count": count,
                "offset": offset,
                "order": "desc",
                "sort": "updated",
            },
        )
        return result

    async def get_issue_comments(
        self,
        issue_id: int,
        count: int = 100,
    ) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = await self._get(
            f"/issues/{issue_id}/comments",
            params={"count": count, "order": "asc"},
        )
        return result

    async def _post(self, path: str, data: dict[str, Any] | None = None) -> Any:
        url = f"{self.base_url}{path}"
        params: dict[str, Any] = {"apiKey": self.api_key}
        response = await self._client.post(url, params=params, data=data)
        response.raise_for_status()
        await asyncio.sleep(0.2)
        return response.json()

    async def post_issue_comment(self, issue_id: int, content: str) -> dict[str, Any]:
        result: dict[str, Any] = await self._post(
            f"/issues/{issue_id}/comments",
            data={"content": content},
        )
        return result

    async def get_user_watchings(
        self,
        user_id: int,
        count: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = await self._get(
            f"/users/{user_id}/watchings",
            params={"count": count, "offset": offset},
        )
        return result
