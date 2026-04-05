from __future__ import annotations

import asyncio
import base64
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class JiraClient:
    """Jira Cloud API v3 非同期クライアント"""

    def __init__(self, base_url: str, user_email: str, api_token: str) -> None:
        self.base_url = base_url.rstrip("/")
        token = base64.b64encode(f"{user_email}:{api_token}".encode()).decode()
        self._client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "Authorization": f"Basic {token}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        url = f"{self.base_url}/rest/api/3{path}"
        response = await self._client.get(url, params=params)
        response.raise_for_status()
        await asyncio.sleep(0.2)
        return response.json()

    async def _post(self, path: str, json: dict[str, Any] | None = None) -> Any:
        url = f"{self.base_url}/rest/api/3{path}"
        response = await self._client.post(url, json=json)
        if response.status_code >= 400:
            logger.error("POST %s → %s: %s", url, response.status_code, response.text)
        response.raise_for_status()
        await asyncio.sleep(0.2)
        return response.json()

    async def get_myself(self) -> dict[str, Any]:
        result: dict[str, Any] = await self._get("/myself")
        return result

    async def get_projects(self) -> list[dict[str, Any]]:
        """全プロジェクトを取得（ページネーション対応）"""
        projects: list[dict[str, Any]] = []
        start_at = 0
        while True:
            data = await self._get("/project/search", params={
                "startAt": start_at,
                "maxResults": 50,
            })
            values = data.get("values", [])
            projects.extend(values)
            if data.get("isLast", True) or not values:
                break
            start_at += len(values)
        return projects

    async def search_issues(
        self,
        project_key: str,
        next_page_token: str | None = None,
        max_results: int = 100,
    ) -> dict[str, Any]:
        """JQL でプロジェクト内の課題を検索 (POST /search/jql, cursor-based)"""
        body: dict[str, Any] = {
            "jql": f"project = {project_key} ORDER BY updated DESC",
            "maxResults": max_results,
            "fields": [
                "summary", "description", "issuetype", "status", "priority",
                "assignee", "reporter", "created", "updated", "duedate",
                "comment", "labels", "timeestimate", "timespent",
            ],
        }
        if next_page_token:
            body["nextPageToken"] = next_page_token
        result: dict[str, Any] = await self._post("/search/jql", json=body)
        return result

    async def post_issue_comment(self, issue_key: str, body_text: str) -> dict[str, Any]:
        """課題にコメントを投稿（ADF 形式で送信）"""
        adf_body = {
            "type": "doc",
            "version": 1,
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": line}],
                }
                for line in body_text.split("\n")
                if line
            ] or [{"type": "paragraph", "content": [{"type": "text", "text": body_text}]}],
        }
        result: dict[str, Any] = await self._post(
            f"/issue/{issue_key}/comment",
            json={"body": adf_body},
        )
        return result

    async def get_issue_comments(
        self,
        issue_key: str,
        start_at: int = 0,
        max_results: int = 100,
    ) -> dict[str, Any]:
        """課題のコメントを取得"""
        result: dict[str, Any] = await self._get(
            f"/issue/{issue_key}/comment",
            params={
                "startAt": start_at,
                "maxResults": max_results,
                "orderBy": "created",
            },
        )
        return result
