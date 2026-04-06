from __future__ import annotations

import logging
import re
from datetime import date, datetime
from typing import Any

from django.utils import timezone

from apps.core.models import BacklogSpace, BacklogUser, Comment, ExcludedStatus, Project, Ticket
from apps.core.services.backlog_client import BacklogClient

logger = logging.getLogger(__name__)

# 停滞判定のデフォルト日���
STAGNANT_THRESHOLD_DAYS = 3

# 完了とみなすステータス名パターン
CLOSED_STATUS_NAMES = {"完了", "Closed", "Done", "Resolved", "Close"}

# 未対応とみなすステータス名パターン
NOT_STARTED_STATUS_NAMES = {"未対応", "Open"}


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    # Backlog の ISO 形式: "2024-01-15T10:30:00Z"
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    return date.fromisoformat(value[:10])


def _extract_list_field(data: dict[str, Any], field_key: str) -> list[str]:
    """Backlog API のリスト属性（category/milestone）から名前リストを抽出する"""
    items = data.get(field_key) or []
    return [v.get("name", str(v)) if isinstance(v, dict) else str(v) for v in items]


def _extract_custom_fields(data: dict[str, Any]) -> list[dict[str, Any]]:
    """Backlog API の customFields + 標準リスト属性(カテゴリ/マイルストーン)を保存用に整形する"""
    result: list[dict[str, Any]] = []

    # 標準リスト属性をカスタム属性と同じ形式で追加
    for field_key, field_name in [("category", "カテゴリ"), ("milestone", "マイルストーン")]:
        items = data.get(field_key) or []
        if items:
            names = [v.get("name", str(v)) if isinstance(v, dict) else str(v) for v in items]
            result.append({
                "id": f"__{field_key}__",
                "name": field_name,
                "fieldTypeId": -1,
                "value": names,
            })

    # カスタム属性
    for cf in data.get("customFields") or []:
        value = cf.get("value")
        if value is None or value == "" or value == []:
            continue
        field: dict[str, Any] = {
            "id": cf["id"],
            "name": cf.get("name", ""),
            "fieldTypeId": cf.get("fieldTypeId", 0),
        }
        # リスト・チェックボックス型: value は [{id, name}] の配列
        if isinstance(value, list):
            field["value"] = [v.get("name", str(v)) if isinstance(v, dict) else str(v) for v in value]
        # 単一リスト等: value は {id, name} の dict
        elif isinstance(value, dict):
            field["value"] = value.get("name", str(value))
        else:
            field["value"] = value
        result.append(field)
    return result


class SyncService:
    """Backlog からデータを取得して DB に同期する"""

    def __init__(self) -> None:
        self.space: BacklogSpace | None = None
        self.client: BacklogClient | None = None
        self._user_cache: dict[int, BacklogUser] = {}
        self._excluded_names: set[str] = set()

    async def sync_all(self) -> None:
        """DB に登録された全スペースのデータを同期する"""
        spaces = [s async for s in BacklogSpace.objects.all()]

        if not spaces:
            raise ValueError(
                "同期対象の Backlog スペースが登録されていません。"
                "設定画面からスペースを追加してください。"
            )

        for space in spaces:
            await self._sync_space(space)

    async def sync_space(self, space_id: int) -> None:
        """指定スペースのみ同期する"""
        try:
            space = await BacklogSpace.objects.aget(pk=space_id)
        except BacklogSpace.DoesNotExist:
            raise ValueError(f"Space {space_id} not found")
        await self._sync_space(space)

    async def _sync_space(self, space: BacklogSpace) -> None:
        """1 スペース分の同期処理"""
        self.space = space
        self._user_cache = {}
        self.client = BacklogClient(
            base_url=space.base_url,
            api_key=space.api_key,
        )

        try:
            logger.info("Sync started for %s", space)

            # 除外ステータス名をキャッシュ（async context で先に読み込む）
            from asgiref.sync import sync_to_async
            self._excluded_names = await sync_to_async(ExcludedStatus.get_excluded_names)()

            # 1. 自分の情報を取得
            await self._sync_myself()

            # 2. プロジェクト一覧を取得
            projects = await self._sync_projects()

            # 3. 各プロジェクトのチケットを取得
            for project in projects:
                await self._sync_project_tickets(project)

            # 4. 同期完了
            space.last_synced_at = timezone.now()
            await space.asave()

            logger.info("Sync completed for %s", space)
        finally:
            await self.client.close()

    async def _sync_myself(self) -> BacklogUser:
        assert self.client is not None
        assert self.space is not None

        data = await self.client.get_myself()
        user, _ = await BacklogUser.objects.aupdate_or_create(
            space=self.space,
            backlog_id=data["id"],
            defaults={
                "user_id_str": data.get("userId") or "",
                "name": data.get("name") or "",
                "mail_address": data.get("mailAddress") or "",
                "is_myself": True,
            },
        )
        self._user_cache[data["id"]] = user
        logger.info("Synced myself: %s", user.name)
        return user

    async def _upsert_user(self, user_data: dict[str, Any] | None) -> BacklogUser | None:
        if not user_data:
            return None

        assert self.space is not None
        backlog_id = user_data["id"]

        if backlog_id in self._user_cache:
            return self._user_cache[backlog_id]

        user, _ = await BacklogUser.objects.aupdate_or_create(
            space=self.space,
            backlog_id=backlog_id,
            defaults={
                "user_id_str": user_data.get("userId") or "",
                "name": user_data.get("name") or "",
                "mail_address": user_data.get("mailAddress") or "",
            },
        )
        self._user_cache[backlog_id] = user
        return user

    async def _sync_projects(self) -> list[Project]:
        assert self.client is not None
        assert self.space is not None

        projects_data = await self.client.get_projects()
        projects: list[Project] = []

        for pdata in projects_data:
            project, _ = await Project.objects.aupdate_or_create(
                space=self.space,
                backlog_id=pdata["id"],
                defaults={
                    "project_key": pdata.get("projectKey", ""),
                    "name": pdata.get("name", ""),
                    "is_active": not pdata.get("archived", False),
                },
            )
            projects.append(project)

        logger.info("Synced %d projects", len(projects))
        return projects

    async def _sync_project_tickets(self, project: Project) -> None:
        assert self.client is not None

        logger.info("Syncing tickets for %s ...", project.project_key)
        offset = 0
        total = 0
        parent_map: list[tuple[int, int]] = []  # (ticket_id, parent_backlog_id)

        while True:
            issues = await self.client.get_issues(
                project_id=project.backlog_id,
                offset=offset,
            )
            if not issues:
                break

            for issue_data in issues:
                ticket, parent_backlog_id = await self._upsert_ticket(project, issue_data)
                if parent_backlog_id:
                    parent_map.append((ticket.id, parent_backlog_id))
                total += 1

            offset += len(issues)
            if len(issues) < 100:
                break

        # パス2: 親子リンク解決
        if parent_map:
            await self._resolve_parent_links(project, parent_map)

        project.last_synced_at = timezone.now()
        await project.asave()
        logger.info("Synced %d tickets for %s", total, project.project_key)

    async def _resolve_parent_links(
        self, project: Project, parent_map: list[tuple[int, int]]
    ) -> None:
        """親チケットリンクを一括解決（バッチ fetch + 個別 UPDATE）"""
        parent_backlog_ids = {pid for _, pid in parent_map}
        parent_lookup: dict[int, int] = {}
        async for t in Ticket.objects.filter(
            project=project, backlog_id__in=parent_backlog_ids
        ).values_list("backlog_id", "id"):
            parent_lookup[t[0]] = t[1]

        linked = 0
        for ticket_id, parent_backlog_id in parent_map:
            parent_pk = parent_lookup.get(parent_backlog_id)
            if parent_pk:
                await Ticket.objects.filter(id=ticket_id).aupdate(parent_ticket_id=parent_pk)
                linked += 1
        logger.info("Resolved %d parent links for %s", linked, project.project_key)

    async def _upsert_ticket(self, project: Project, data: dict[str, Any]) -> tuple[Ticket, int | None]:
        assignee = await self._upsert_user(data.get("assignee"))
        created_user = await self._upsert_user(data.get("createdUser"))

        status = data.get("status") or {}
        priority = data.get("priority") or {}
        issue_type = data.get("issueType") or {}

        backlog_updated = _parse_datetime(data.get("updated"))
        due_date = _parse_date(data.get("dueDate"))
        status_name = status.get("name", "")

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
            existing = await Ticket.objects.aget(project=project, backlog_id=data["id"])
            if existing.status_name != status_name:
                previous_status_name = existing.status_name
                status_changed_at = timezone.now()
            else:
                # 変更なし → 既存の値を維持
                previous_status_name = existing.previous_status_name
                status_changed_at = existing.status_changed_at
        except Ticket.DoesNotExist:
            pass  # 新規チケット

        ticket, _ = await Ticket.objects.aupdate_or_create(
            project=project,
            backlog_id=data["id"],
            defaults={
                "issue_key": data.get("issueKey", ""),
                "summary": data.get("summary", ""),
                "description": data.get("description") or "",
                "issue_type": issue_type.get("name", ""),
                "status_name": status_name,
                "status_id": status.get("id", 0),
                "priority_name": priority.get("name", ""),
                "priority_id": priority.get("id", 0),
                "assignee": assignee,
                "created_user": created_user,
                "start_date": _parse_date(data.get("startDate")),
                "due_date": due_date,
                "estimated_hours": data.get("estimatedHours"),
                "actual_hours": data.get("actualHours"),
                "comment_count": data.get("commentCount", 0) or 0,
                "custom_fields": _extract_custom_fields(data),
                "categories": _extract_list_field(data, "category"),
                "milestone_names": _extract_list_field(data, "milestone"),
                "backlog_created": _parse_datetime(data.get("created")),
                "backlog_updated": backlog_updated,
                "is_overdue": is_overdue,
                "is_stagnant": is_stagnant,
                "stagnant_days": stagnant_days,
                "previous_status_name": previous_status_name,
                "status_changed_at": status_changed_at,
            },
        )

        # マイルストーンレコードの自動登録
        milestone_names = ticket.milestone_names or []
        if milestone_names:
            from apps.core.models import Milestone

            for ms_name in milestone_names:
                await Milestone.objects.aget_or_create(
                    project=project, name=ms_name,
                )

        # コメント同期
        await self._sync_ticket_comments(ticket)

        parent_backlog_id = data.get("parentIssueId")
        return ticket, parent_backlog_id

    async def _sync_ticket_comments(self, ticket: Ticket) -> None:
        assert self.client is not None

        comments_data = await self.client.get_issue_comments(
            issue_id=ticket.backlog_id,
        )

        last_comment_at = None
        for cdata in comments_data:
            created_user = await self._upsert_user(cdata.get("createdUser"))
            content = cdata.get("content") or ""
            backlog_created = _parse_datetime(cdata.get("created"))

            has_attachments = bool(cdata.get("attachments"))

            # 【方針書】マーカー検出 → spec タグを自動付与
            tags: list[str] = []
            if content.startswith("【方針書】"):
                tags = ["spec"]

            comment, _ = await Comment.objects.aupdate_or_create(
                ticket=ticket,
                backlog_id=cdata["id"],
                defaults={
                    "content": content,
                    "created_user": created_user,
                    "has_attachments": has_attachments,
                    "backlog_created": backlog_created,
                    "source": "synced",
                    "posted_at": backlog_created,
                },
            )
            # タグは既存のタグを保持しつつ、マーカーがあれば spec を追加
            if tags and "spec" not in (comment.tags or []):
                existing = comment.tags or []
                comment.tags = list(set(existing + tags))
                await comment.asave(update_fields=["tags"])

            # メンション解析
            await self._parse_mentions(comment, content)

            if backlog_created:
                if last_comment_at is None or backlog_created > last_comment_at:
                    last_comment_at = backlog_created

        # WEB側で削除されたコメントをDB上からも削除
        synced_ids = {cdata["id"] for cdata in comments_data}
        stale_comments = Comment.objects.filter(
            ticket=ticket, source="synced",
        ).exclude(backlog_id__in=synced_ids)
        deleted_count = await stale_comments.acount()
        if deleted_count:
            await stale_comments.adelete()
            logger.info("Deleted %d stale comments for %s", deleted_count, ticket.issue_key)

        # comment_count を実際の件数で更新
        actual_count = await Comment.objects.filter(ticket=ticket).acount()
        update_fields = ["comment_count"]
        ticket.comment_count = actual_count
        if last_comment_at:
            ticket.last_comment_at = last_comment_at
            update_fields.append("last_comment_at")
        await ticket.asave(update_fields=update_fields)

    async def _parse_mentions(self, comment: Comment, content: str) -> None:
        # Backlog のメンション形式: @user_id_str
        mention_pattern = re.compile(r"@(\w+)")
        matches = mention_pattern.findall(content)

        if not matches:
            return

        assert self.space is not None
        mentioned_users: list[BacklogUser] = []

        for user_id_str in matches:
            try:
                user = await BacklogUser.objects.aget(
                    space=self.space,
                    user_id_str=user_id_str,
                )
                mentioned_users.append(user)
            except BacklogUser.DoesNotExist:
                pass

        if mentioned_users:
            await comment.mentioned_users.aset(mentioned_users)
