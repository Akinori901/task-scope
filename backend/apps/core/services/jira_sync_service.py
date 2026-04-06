from __future__ import annotations

import logging
import re
from datetime import date, datetime
from typing import Any

from django.utils import timezone

from apps.core.models import BacklogUser, Comment, ExcludedStatus, JiraSpace, Project, Ticket
from apps.core.services.jira_client import JiraClient

logger = logging.getLogger(__name__)

STAGNANT_THRESHOLD_DAYS = 3
CLOSED_STATUS_NAMES = {"完了", "Closed", "Done", "Resolved", "Close"}
NOT_STARTED_STATUS_NAMES = {"未対応", "Open", "To Do"}


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    return date.fromisoformat(value[:10])


def _adf_to_text(node: Any) -> str:
    """Jira の Atlassian Document Format (ADF) をプレーンテキストに変換する"""
    if isinstance(node, str):
        return node
    if not isinstance(node, dict):
        return ""
    text_parts: list[str] = []
    if node.get("type") == "text":
        text_parts.append(node.get("text", ""))
    for child in node.get("content", []):
        text_parts.append(_adf_to_text(child))
    if node.get("type") in ("paragraph", "heading", "bulletList", "orderedList", "listItem"):
        text_parts.append("\n")
    return "".join(text_parts)


class JiraSyncService:
    """Jira Cloud からデータを取得して DB に同期する"""

    def __init__(self) -> None:
        self.jira_space: JiraSpace | None = None
        self.client: JiraClient | None = None
        self._user_cache: dict[str, BacklogUser] = {}
        self._excluded_names: set[str] = set()

    async def sync_space(self, space_id: int) -> None:
        """指定 Jira スペースを同期する"""
        try:
            space = await JiraSpace.objects.aget(pk=space_id)
        except JiraSpace.DoesNotExist:
            raise ValueError(f"JiraSpace {space_id} not found")
        await self._sync_space(space)

    async def _sync_space(self, space: JiraSpace) -> None:
        self.jira_space = space
        self._user_cache = {}
        self.client = JiraClient(
            base_url=space.base_url,
            user_email=space.user_email,
            api_token=space.api_token,
        )

        try:
            logger.info("Jira sync started for %s", space)

            from asgiref.sync import sync_to_async
            self._excluded_names = await sync_to_async(ExcludedStatus.get_excluded_names)()

            # 1. 自分の情報
            await self._sync_myself()

            # 2. プロジェクト一覧
            projects = await self._sync_projects()

            # 3. 各プロジェクトのチケット
            for project in projects:
                await self._sync_project_tickets(project)

            # 4. 完了
            space.last_synced_at = timezone.now()
            await space.asave()

            logger.info("Jira sync completed for %s", space)
        finally:
            await self.client.close()

    async def _sync_myself(self) -> BacklogUser:
        assert self.client is not None
        assert self.jira_space is not None

        data = await self.client.get_myself()
        account_id = data.get("accountId", "")
        user, _ = await BacklogUser.objects.aupdate_or_create(
            jira_space=self.jira_space,
            user_id_str=account_id,
            defaults={
                "backlog_id": 0,
                "name": data.get("displayName", ""),
                "mail_address": data.get("emailAddress", ""),
                "is_myself": True,
            },
        )
        self._user_cache[account_id] = user
        logger.info("Synced Jira myself: %s", user.name)
        return user

    async def _upsert_user(self, user_data: dict[str, Any] | None) -> BacklogUser | None:
        if not user_data:
            return None

        assert self.jira_space is not None
        account_id = user_data.get("accountId", "")
        if not account_id:
            return None

        if account_id in self._user_cache:
            return self._user_cache[account_id]

        user, _ = await BacklogUser.objects.aupdate_or_create(
            jira_space=self.jira_space,
            user_id_str=account_id,
            defaults={
                "backlog_id": 0,
                "name": user_data.get("displayName", ""),
                "mail_address": user_data.get("emailAddress", ""),
            },
        )
        self._user_cache[account_id] = user
        return user

    async def _sync_projects(self) -> list[Project]:
        assert self.client is not None
        assert self.jira_space is not None

        projects_data = await self.client.get_projects()
        projects: list[Project] = []

        for pdata in projects_data:
            jira_id = pdata.get("id", 0)
            project, _ = await Project.objects.aupdate_or_create(
                jira_space=self.jira_space,
                backlog_id=int(jira_id),
                defaults={
                    "project_key": pdata.get("key", ""),
                    "name": pdata.get("name", ""),
                    "is_active": not pdata.get("archived", False),
                },
            )
            projects.append(project)

        logger.info("Synced %d Jira projects", len(projects))
        return projects

    async def _sync_project_tickets(self, project: Project) -> None:
        assert self.client is not None

        logger.info("Syncing Jira tickets for %s ...", project.project_key)
        total = 0
        next_page_token: str | None = None
        parent_map: list[tuple[int, int]] = []  # (ticket_id, parent_jira_id)

        while True:
            result = await self.client.search_issues(
                project_key=project.project_key,
                next_page_token=next_page_token,
            )
            issues = result.get("issues", [])
            if not issues:
                break

            for issue_data in issues:
                ticket, parent_jira_id = await self._upsert_ticket(project, issue_data)
                if parent_jira_id:
                    parent_map.append((ticket.id, parent_jira_id))
                total += 1

            next_page_token = result.get("nextPageToken")
            if not next_page_token:
                break

        # パス2: 親子リンク解決
        if parent_map:
            await self._resolve_parent_links(project, parent_map)

        project.last_synced_at = timezone.now()
        await project.asave()
        logger.info("Synced %d Jira tickets for %s", total, project.project_key)

    async def _resolve_parent_links(
        self, project: Project, parent_map: list[tuple[int, int]]
    ) -> None:
        """親チケットリンクを一括解決（バッチ fetch + 個別 UPDATE）"""
        parent_jira_ids = {pid for _, pid in parent_map}
        parent_lookup: dict[int, int] = {}
        async for t in Ticket.objects.filter(
            project=project, backlog_id__in=parent_jira_ids
        ).values_list("backlog_id", "id"):
            parent_lookup[t[0]] = t[1]

        linked = 0
        for ticket_id, parent_jira_id in parent_map:
            parent_pk = parent_lookup.get(parent_jira_id)
            if parent_pk:
                await Ticket.objects.filter(id=ticket_id).aupdate(parent_ticket_id=parent_pk)
                linked += 1
        logger.info("Resolved %d Jira parent links for %s", linked, project.project_key)

    async def _upsert_ticket(self, project: Project, data: dict[str, Any]) -> tuple[Ticket, int | None]:
        fields = data.get("fields", {})
        issue_key = data.get("key", "")
        jira_id = int(data.get("id", 0))

        assignee = await self._upsert_user(fields.get("assignee"))
        created_user = await self._upsert_user(fields.get("reporter"))

        status = fields.get("status") or {}
        priority = fields.get("priority") or {}
        issue_type = fields.get("issuetype") or {}

        backlog_updated = _parse_datetime(fields.get("updated"))
        due_date = _parse_date(fields.get("duedate"))
        status_name = status.get("name", "")

        # 説明（ADF → テキスト）
        description_adf = fields.get("description")
        description = _adf_to_text(description_adf) if description_adf else ""

        # 遅延・停滞判定
        today = date.today()
        closed = status_name in CLOSED_STATUS_NAMES or status_name in self._excluded_names
        is_overdue = bool(due_date and due_date < today and not closed)

        stagnant_days = 0
        is_stagnant = False
        if backlog_updated and not closed:
            days_since_update = (timezone.now() - backlog_updated).days
            if days_since_update >= STAGNANT_THRESHOLD_DAYS:
                is_stagnant = True
                stagnant_days = days_since_update

        # ステータス変更検出
        previous_status_name = None
        status_changed_at = None
        try:
            existing = await Ticket.objects.aget(project=project, backlog_id=jira_id)
            if existing.status_name != status_name:
                previous_status_name = existing.status_name
                status_changed_at = timezone.now()
            else:
                previous_status_name = existing.previous_status_name
                status_changed_at = existing.status_changed_at
        except Ticket.DoesNotExist:
            pass

        # 工数（秒 → 時間）
        time_estimate = fields.get("timeestimate")
        time_spent = fields.get("timespent")
        estimated_hours = time_estimate / 3600.0 if time_estimate else None
        actual_hours = time_spent / 3600.0 if time_spent else None

        # コメント数
        comment_data = fields.get("comment", {})
        comment_count = comment_data.get("total", 0) if isinstance(comment_data, dict) else 0

        ticket, _ = await Ticket.objects.aupdate_or_create(
            project=project,
            backlog_id=jira_id,
            defaults={
                "issue_key": issue_key,
                "summary": fields.get("summary", ""),
                "description": description,
                "issue_type": issue_type.get("name", ""),
                "status_name": status_name,
                "status_id": int(status.get("id", 0) or 0),
                "priority_name": priority.get("name", "") if priority else "",
                "priority_id": 0,
                "assignee": assignee,
                "created_user": created_user,
                "start_date": None,
                "due_date": due_date,
                "estimated_hours": estimated_hours,
                "actual_hours": actual_hours,
                "comment_count": comment_count,
                "custom_fields": _extract_labels(fields),
                "categories": [],
                "milestone_names": [],
                "backlog_created": _parse_datetime(fields.get("created")),
                "backlog_updated": backlog_updated,
                "is_overdue": is_overdue,
                "is_stagnant": is_stagnant,
                "stagnant_days": stagnant_days,
                "previous_status_name": previous_status_name,
                "status_changed_at": status_changed_at,
            },
        )

        # コメント同期
        await self._sync_ticket_comments(ticket)

        parent_data = fields.get("parent")
        parent_jira_id = int(parent_data["id"]) if parent_data and parent_data.get("id") else None
        return ticket, parent_jira_id

    async def _sync_ticket_comments(self, ticket: Ticket) -> None:
        assert self.client is not None

        result = await self.client.get_issue_comments(issue_key=ticket.issue_key)
        comments = result.get("comments", [])

        last_comment_at = None
        for cdata in comments:
            author = cdata.get("author", {})
            created_user = await self._upsert_user(author)

            body_adf = cdata.get("body")
            content = _adf_to_text(body_adf) if body_adf else ""
            backlog_created = _parse_datetime(cdata.get("created"))
            jira_comment_id = int(cdata.get("id", 0))

            tags: list[str] = []
            if content.startswith("【方針書】"):
                tags = ["spec"]

            comment, _ = await Comment.objects.aupdate_or_create(
                ticket=ticket,
                backlog_id=jira_comment_id,
                defaults={
                    "content": content,
                    "created_user": created_user,
                    "has_attachments": False,
                    "backlog_created": backlog_created,
                    "source": "synced",
                    "posted_at": backlog_created,
                },
            )
            if tags and "spec" not in (comment.tags or []):
                existing_tags = comment.tags or []
                comment.tags = list(set(existing_tags + tags))
                await comment.asave(update_fields=["tags"])

            if backlog_created:
                if last_comment_at is None or backlog_created > last_comment_at:
                    last_comment_at = backlog_created

        # WEB側で削除されたコメントをDB上からも削除
        synced_ids = {int(cdata.get("id", 0)) for cdata in comments}
        stale_comments = Comment.objects.filter(
            ticket=ticket, source="synced",
        ).exclude(backlog_id__in=synced_ids)
        deleted_count = await stale_comments.acount()
        if deleted_count:
            await stale_comments.adelete()
            logger.info("Deleted %d stale comments for %s", deleted_count, ticket.issue_key)

        actual_count = await Comment.objects.filter(ticket=ticket).acount()
        update_fields = ["comment_count"]
        ticket.comment_count = actual_count
        if last_comment_at:
            ticket.last_comment_at = last_comment_at
            update_fields.append("last_comment_at")
        await ticket.asave(update_fields=update_fields)


def _extract_labels(fields: dict[str, Any]) -> list[dict[str, Any]]:
    """Jira の labels をカスタム属性形式に変換する"""
    labels = fields.get("labels") or []
    if not labels:
        return []
    return [{
        "id": "__labels__",
        "name": "ラベル",
        "fieldTypeId": -1,
        "value": labels,
    }]
