"""コメントの作成・編集・削除と、Backlog / Jira への投稿"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from typing import TYPE_CHECKING

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models import (
    Comment,
    Ticket,
)
from apps.core.serializers import (
    CommentSerializer,
)

if TYPE_CHECKING:
    from rest_framework.request import Request


logger = logging.getLogger(__name__)


class CommentCreateView(APIView):
    """手動コメント作成 API"""

    def post(self, request: Request, pk: int) -> Response:
        content = request.data.get("content", "")
        if not content:
            return Response({"error": "content is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            ticket = Ticket.objects.get(pk=pk)
        except Ticket.DoesNotExist:
            return Response({"error": "Ticket not found"}, status=status.HTTP_404_NOT_FOUND)

        tags = request.data.get("tags", [])

        # 手動コメントにはユニークな backlog_id を割り当て（ユニーク制約回避）
        import time

        manual_id = int(time.time() * 1000000)  # マイクロ秒タイムスタンプ

        comment = Comment.objects.create(
            ticket=ticket,
            backlog_id=manual_id,
            content=content,
            tags=tags,
            source="manual",
            backlog_created=timezone.now(),
        )
        serializer = CommentSerializer(comment)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class CommentUpdateTagsView(APIView):
    """コメントタグ更新 API"""

    def patch(self, request: Request, pk: int, comment_pk: int) -> Response:
        try:
            comment = Comment.objects.get(pk=comment_pk, ticket_id=pk)
        except Comment.DoesNotExist:
            return Response({"error": "Comment not found"}, status=status.HTTP_404_NOT_FOUND)

        tags = request.data.get("tags")
        if tags is None:
            return Response({"error": "tags is required"}, status=status.HTTP_400_BAD_REQUEST)

        comment.tags = tags
        comment.save(update_fields=["tags"])
        serializer = CommentSerializer(comment)
        return Response(serializer.data)


class CommentUpdateView(APIView):
    """未投稿コメント内容更新 API"""

    def patch(self, request: Request, pk: int, comment_pk: int) -> Response:
        try:
            comment = Comment.objects.get(pk=comment_pk, ticket_id=pk)
        except Comment.DoesNotExist:
            return Response({"error": "Comment not found"}, status=status.HTTP_404_NOT_FOUND)

        if comment.source == "synced":
            return Response({"error": "同期コメントは編集できません"}, status=status.HTTP_400_BAD_REQUEST)
        if comment.posted_at is not None:
            return Response({"error": "投稿済みコメントは編集できません"}, status=status.HTTP_400_BAD_REQUEST)

        content = request.data.get("content")
        if content is not None:
            comment.content = content
        tags = request.data.get("tags")
        if tags is not None:
            comment.tags = tags

        comment.save(update_fields=["content", "tags"])
        serializer = CommentSerializer(comment)
        return Response(serializer.data)


class CommentDeleteView(APIView):
    """未投稿コメント削除 API"""

    def delete(self, request: Request, pk: int, comment_pk: int) -> Response:
        try:
            comment = Comment.objects.get(pk=comment_pk, ticket_id=pk)
        except Comment.DoesNotExist:
            return Response({"error": "Comment not found"}, status=status.HTTP_404_NOT_FOUND)

        if comment.source == "synced":
            return Response({"error": "同期コメントは削除できません"}, status=status.HTTP_400_BAD_REQUEST)
        if comment.posted_at is not None:
            return Response({"error": "投稿済みコメントは削除できません"}, status=status.HTTP_400_BAD_REQUEST)

        comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CommentPostToBacklogView(APIView):
    """コメントを Backlog / Jira に投稿する API"""

    def post(self, request: Request, pk: int, comment_pk: int) -> Response:
        try:
            comment = Comment.objects.select_related("ticket__project__space", "ticket__project__jira_space").get(
                pk=comment_pk, ticket_id=pk
            )
        except Comment.DoesNotExist:
            return Response({"error": "Comment not found"}, status=status.HTTP_404_NOT_FOUND)

        if comment.posted_at is not None:
            return Response({"error": "既に投稿済みです"}, status=status.HTTP_400_BAD_REQUEST)

        ticket = comment.ticket
        # spec タグ付きの場合は【方針書】マーカーを付与
        post_content = comment.content
        if "spec" in (comment.tags or []):
            post_content = f"【方針書】\n{post_content}"

        project = ticket.project
        jira_space = project.jira_space
        space = project.space
        is_jira = jira_space is not None
        if jira_space is None and space is None:
            return Response(
                {"error": "このチケットのプロジェクトに連携先（Backlog / Jira）が設定されていません"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            if jira_space is not None:
                from apps.core.services.jira_client import JiraClient

                async def _post_jira() -> None:
                    client = JiraClient(
                        base_url=jira_space.base_url,
                        user_email=jira_space.user_email,
                        api_token=jira_space.api_token,
                    )
                    try:
                        await client.post_issue_comment(ticket.issue_key, post_content)
                    finally:
                        await client.close()

                asyncio.run(_post_jira())
            elif space is not None:
                from apps.core.services.backlog_client import BacklogClient

                async def _post_backlog() -> None:
                    client = BacklogClient(base_url=space.base_url, api_key=space.api_key)
                    try:
                        await client.post_issue_comment(ticket.backlog_id, post_content)
                    finally:
                        await client.close()

                asyncio.run(_post_backlog())

            comment.posted_at = timezone.now()
            comment.save(update_fields=["posted_at"])

            serializer = CommentSerializer(comment)
            return Response(serializer.data)
        except Exception:
            target = "Jira" if is_jira else "Backlog"
            logger.exception("Failed to post comment to %s for %s", target, ticket.issue_key)
            return Response(
                {"error": f"{target} へのコメント投稿に失敗しました"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class UnpostedSpecsView(APIView):
    """未投稿の方針書コメント一覧"""

    def get(self, request: Request) -> Response:
        comments = (
            Comment.objects.select_related("ticket__project")
            .filter(
                tags__contains=["spec"],
                posted_at__isnull=True,
            )
            .exclude(source="synced")
            .order_by("-created_at")
        )
        data = [
            {
                "id": c.pk,
                "ticket_id": c.ticket_id,
                "issue_key": c.ticket.issue_key,
                "summary": c.ticket.summary,
                "created_at": c.created_at,
            }
            for c in comments
        ]
        return Response(data)


class BulkPostCommentsView(APIView):
    """未投稿の spec コメントを一括で Backlog に投稿"""

    def post(self, request: Request) -> Response:
        comment_ids = request.data.get("comment_ids", [])
        if not comment_ids:
            return Response({"error": "comment_ids is required"}, status=status.HTTP_400_BAD_REQUEST)

        comments = list(
            Comment.objects.select_related("ticket__project__space").filter(pk__in=comment_ids, posted_at__isnull=True)
        )
        if not comments:
            return Response({"posted": 0, "errors": []})

        from apps.core.services.backlog_client import BacklogClient

        posted = 0
        errors: list[str] = []
        # スペースごとにクライアントをキャッシュ
        clients: dict[int, BacklogClient] = {}

        for comment in comments:
            ticket = comment.ticket
            space = ticket.project.space
            # 一括投稿は Backlog だけが対象。Jira のチケットが混ざっていても、
            # ここで落とさずに対象外として返し、残りの投稿を続ける。
            if space is None:
                errors.append(f"{ticket.issue_key}: Backlog のチケットではないため一括投稿の対象外")
                continue
            if space.id not in clients:
                clients[space.id] = BacklogClient(base_url=space.base_url, api_key=space.api_key)

            post_content = comment.content
            if "spec" in (comment.tags or []):
                post_content = f"【方針書】\n{post_content}"

            try:
                client = clients[space.id]
                asyncio.run(client.post_issue_comment(ticket.backlog_id, post_content))
                comment.posted_at = timezone.now()
                comment.save(update_fields=["posted_at"])
                posted += 1
            except Exception:
                logger.exception("Failed to post comment %d to Backlog", comment.pk)
                errors.append(f"{ticket.issue_key}: 投稿失敗")

        # クライアントを閉じる失敗は結果に影響しないので無視する
        for client in clients.values():
            with contextlib.suppress(Exception):
                asyncio.run(client.close())

        return Response({"posted": posted, "errors": errors})
