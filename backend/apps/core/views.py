from __future__ import annotations

import asyncio
import csv
import io
import logging
import threading
import uuid

from django.db.models import Count, Q, QuerySet
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

# バックグラウンドタスク管理（方針書生成・評価など）
_bg_tasks: dict[str, dict] = {}
_bg_tasks_lock = threading.Lock()

from apps.core.filters import TicketFilter
from apps.core.models import BacklogSpace, BacklogUser, CodeRepository, Comment, ExcludedStatus, JiraSpace, PinnedTicket, Project, Ticket

from apps.core.serializers import (
    BacklogSpaceSerializer,
    BacklogUserSerializer,
    CodeRepositorySerializer,
    CommentSerializer,
    DashboardStatsSerializer,
    ExcludedStatusSerializer,
    JiraSpaceSerializer,
    ProjectSerializer,
    TicketDetailSerializer,
    TicketEvaluationSerializer,
    TicketSerializer,
)
import httpx as _httpx
from django.conf import settings as _settings

from apps.core.services.evaluation_service import evaluate_ticket, generate_spec
from apps.core.services.sync_service import NOT_STARTED_STATUS_NAMES, SyncService

logger = logging.getLogger(__name__)


class DashboardStatsView(APIView):
    """ダッシュボード集計 API"""

    def get(self, request: Request) -> Response:
        view_mode = request.query_params.get("view", "all")
        space_id = request.query_params.get("space")
        jira_space_id = request.query_params.get("jira_space")
        project_id = request.query_params.get("project")
        status_name = request.query_params.get("status_name")
        assignee_id = request.query_params.get("assignee")
        search = request.query_params.get("search")

        # ベースクエリ
        tickets = Ticket.objects.select_related("assignee", "project", "project__space", "project__jira_space")

        # フィルタ適用
        if space_id:
            tickets = tickets.filter(project__space_id=space_id)
        elif jira_space_id:
            tickets = tickets.filter(project__jira_space_id=jira_space_id)
        if project_id:
            tickets = tickets.filter(project_id=project_id)
        if status_name:
            tickets = tickets.filter(status_name=status_name)
        if assignee_id:
            tickets = tickets.filter(assignee_id=assignee_id)
        if search:
            tickets = tickets.filter(
                Q(summary__icontains=search) | Q(issue_key__icontains=search)
            )

        # 自分ビューのフィルタ
        myself_users = list(BacklogUser.objects.filter(is_myself=True))
        if view_mode == "my" and myself_users:
            myself_ids = [u.id for u in myself_users]
            mentioned_ticket_ids = list(
                Comment.objects.filter(mentioned_users__id__in=myself_ids)
                .values_list("ticket_id", flat=True)
            )
            tickets = tickets.filter(
                Q(assignee__in=myself_ids) | Q(id__in=mentioned_ticket_ids)
            ).distinct()

        # フィルタ対象のプロジェクトIDを取得して除外ステータスを決定
        project_ids = list(tickets.values_list("project_id", flat=True).distinct())
        excluded_names = ExcludedStatus.get_excluded_names(project_ids)
        not_started_names = NOT_STARTED_STATUS_NAMES

        total = tickets.count()
        excluded = tickets.filter(status_name__in=excluded_names).count()
        not_started = tickets.filter(status_name__in=not_started_names).count()
        incomplete = total - excluded
        overdue = tickets.filter(is_overdue=True).count()
        stagnant = tickets.filter(is_stagnant=True).count()
        completion_rate = round(excluded / total * 100, 1) if total > 0 else 0.0

        # 自分関連（全体ビューでも表示）
        my_total = 0
        my_overdue = 0
        my_stagnant = 0
        if myself_users:
            myself_ids = [u.id for u in myself_users]
            my_tickets = Ticket.objects.filter(assignee__in=myself_ids)
            if space_id:
                my_tickets = my_tickets.filter(project__space_id=space_id)
            my_total = my_tickets.count()
            my_overdue = my_tickets.filter(is_overdue=True).count()
            my_stagnant = my_tickets.filter(is_stagnant=True).count()

        # プロジェクト別集計
        projects = Project.objects.filter(is_active=True)
        if space_id:
            projects = projects.filter(space_id=space_id)
        projects = projects.annotate(
            ticket_count=Count("tickets"),
            completed_count=Count("tickets", filter=Q(tickets__status_name__in=excluded_names)),
            overdue_count=Count("tickets", filter=Q(tickets__is_overdue=True)),
        )

        # ステータス分布（除外ステータスを除外）
        status_dist = (
            tickets.exclude(status_name__in=excluded_names)
            .values("status_name")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        status_distribution = [
            {"status": item["status_name"], "count": item["count"]}
            for item in status_dist
        ]

        # 担当者別負荷
        workload_qs = (
            tickets.filter(assignee__isnull=False)
            .values("assignee__name")
            .annotate(
                total=Count("id"),
                overdue=Count("id", filter=Q(is_overdue=True)),
            )
            .order_by("-total")[:20]
        )
        assignee_workload = [
            {
                "name": item["assignee__name"],
                "total": item["total"],
                "overdue": item["overdue"],
            }
            for item in workload_qs
        ]

        # 最終同期日時
        space = BacklogSpace.objects.first()
        last_synced_at = space.last_synced_at if space else None

        data = {
            "total_tickets": total,
            "completed_tickets": excluded,
            "not_started_tickets": not_started,
            "incomplete_tickets": incomplete,
            "overdue_tickets": overdue,
            "stagnant_tickets": stagnant,
            "completion_rate": completion_rate,
            "my_total": my_total,
            "my_overdue": my_overdue,
            "my_stagnant": my_stagnant,
            "projects": projects,
            "status_distribution": status_distribution,
            "assignee_workload": assignee_workload,
            "last_synced_at": last_synced_at,
        }

        serializer = DashboardStatsSerializer(data)
        return Response(serializer.data)


class TicketListView(generics.ListAPIView[Ticket]):
    """チケット一覧 API（フィルタ・検索・ソート対応）"""

    serializer_class = TicketSerializer
    filterset_class = TicketFilter
    search_fields = ["summary", "issue_key"]
    ordering_fields = ["backlog_updated", "due_date", "priority_id", "status_id"]
    ordering = ["-backlog_updated"]

    def get_queryset(self) -> QuerySet[Ticket]:
        return Ticket.objects.select_related("project", "project__space", "project__jira_space", "assignee")


class TicketExportView(generics.ListAPIView[Ticket]):
    """チケット一覧を CSV エクスポート"""

    serializer_class = TicketSerializer
    filterset_class = TicketFilter
    search_fields = ["summary", "issue_key"]
    ordering_fields = ["backlog_updated", "due_date", "priority_id", "status_id"]
    ordering = ["-backlog_updated"]
    pagination_class = None  # ページネーション無効

    def get_queryset(self) -> QuerySet[Ticket]:
        return Ticket.objects.select_related("project", "project__space", "project__jira_space", "assignee")

    CSV_COLUMNS = [
        ("issue_key", "課題キー"),
        ("project_key", "プロジェクト"),
        ("summary", "件名"),
        ("issue_type", "種別"),
        ("status_name", "ステータス"),
        ("priority_name", "優先度"),
        ("assignee_name", "担当者"),
        ("start_date", "開始日"),
        ("due_date", "期限日"),
        ("estimated_hours", "予定時間"),
        ("actual_hours", "実績時間"),
        ("is_overdue", "遅延"),
        ("is_stagnant", "停滞"),
        ("stagnant_days", "停滞日数"),
        ("backlog_created", "起票日"),
        ("backlog_updated", "最終更新"),
    ]

    def list(self, request: Request, *args: object, **kwargs: object) -> HttpResponse:
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)

        buf = io.StringIO()
        writer = csv.writer(buf)
        headers = [col[1] for col in self.CSV_COLUMNS]
        writer.writerow(headers)

        fields = [col[0] for col in self.CSV_COLUMNS]
        for row in serializer.data:
            writer.writerow([row.get(f, "") for f in fields])

        response = HttpResponse(
            buf.getvalue().encode("utf-8-sig"),
            content_type="text/csv; charset=utf-8-sig",
        )
        response["Content-Disposition"] = 'attachment; filename="tickets.csv"'
        return response


class ProjectListView(generics.ListAPIView[Project]):
    """プロジェクト一覧 API"""

    serializer_class = ProjectSerializer

    def get_queryset(self) -> QuerySet[Project]:
        qs = Project.objects.filter(is_active=True)
        space_id = self.request.query_params.get("space")
        jira_space_id = self.request.query_params.get("jira_space")
        if space_id:
            qs = qs.filter(space_id=space_id)
        elif jira_space_id:
            qs = qs.filter(jira_space_id=jira_space_id)
        project_ids = list(qs.values_list("id", flat=True))
        excluded_names = ExcludedStatus.get_excluded_names(project_ids)
        return qs.annotate(
            ticket_count=Count("tickets"),
            completed_count=Count("tickets", filter=Q(tickets__status_name__in=excluded_names)),
            overdue_count=Count("tickets", filter=Q(tickets__is_overdue=True)),
        )


class BacklogUserListView(generics.ListAPIView[BacklogUser]):
    """ユーザー一覧 API"""

    serializer_class = BacklogUserSerializer

    def get_queryset(self) -> QuerySet[BacklogUser]:
        qs = BacklogUser.objects.all()
        space_id = self.request.query_params.get("space")
        jira_space_id = self.request.query_params.get("jira_space")
        if space_id:
            qs = qs.filter(space_id=space_id)
        elif jira_space_id:
            qs = qs.filter(jira_space_id=jira_space_id)
        return qs


class BacklogUserUpdateView(generics.UpdateAPIView[BacklogUser]):
    """ユーザー更新 API（is_myself トグル用）"""

    queryset = BacklogUser.objects.all()
    serializer_class = BacklogUserSerializer


class TicketDetailView(generics.RetrieveAPIView[Ticket]):
    """チケット詳細 API（評価・方針書含む）"""

    serializer_class = TicketDetailSerializer

    def get_queryset(self) -> QuerySet[Ticket]:
        return Ticket.objects.select_related(
            "project", "assignee", "evaluation"
        ).prefetch_related("comments__created_user")


class TicketEvaluateView(APIView):
    """チケット AI 評価トリガー API"""

    def post(self, request: Request, pk: int) -> Response:
        try:
            ticket = Ticket.objects.select_related("project", "project__space", "project__jira_space", "assignee").get(pk=pk)
        except Ticket.DoesNotExist:
            return Response(
                {"error": "Ticket not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            evaluation = evaluate_ticket(ticket)
            serializer = TicketEvaluationSerializer(evaluation)
            return Response(serializer.data)
        except Exception:
            logger.exception("Evaluation failed for ticket %s", ticket.issue_key)
            return Response(
                {"error": "Evaluation failed"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


def _run_spec_generation(task_id: str, ticket_id: int) -> None:
    """バックグラウンドで方針書生成を実行"""
    import django
    django.setup()
    try:
        ticket = Ticket.objects.select_related("project", "project__space", "project__jira_space", "assignee").get(pk=ticket_id)
        comment = generate_spec(ticket)
        with _bg_tasks_lock:
            _bg_tasks[task_id].update({
                "status": "completed",
                "comment_id": comment.pk,
                "issue_key": ticket.issue_key,
            })
    except Exception as e:
        logger.exception("Background spec generation failed for ticket %d", ticket_id)
        with _bg_tasks_lock:
            _bg_tasks[task_id].update({
                "status": "failed",
                "error": str(e),
            })


class TicketGenerateSpecView(APIView):
    """方針書生成 API（バックグラウンド実行）"""

    def post(self, request: Request, pk: int) -> Response:
        try:
            ticket = Ticket.objects.select_related("project", "project__space", "project__jira_space", "assignee").get(pk=pk)
        except Ticket.DoesNotExist:
            return Response(
                {"error": "Ticket not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        task_id = str(uuid.uuid4())
        with _bg_tasks_lock:
            _bg_tasks[task_id] = {
                "status": "running",
                "ticket_id": pk,
                "issue_key": ticket.issue_key,
                "summary": ticket.summary,
                "started_at": timezone.now().isoformat(),
            }

        thread = threading.Thread(
            target=_run_spec_generation,
            args=(task_id, pk),
            daemon=True,
        )
        thread.start()

        return Response(
            {"task_id": task_id, "status": "running"},
            status=status.HTTP_202_ACCEPTED,
        )


class BackgroundTaskStatusView(APIView):
    """バックグラウンドタスクのステータス確認"""

    def get(self, request: Request) -> Response:
        """全タスクの一覧（running のみ or 全部）"""
        with _bg_tasks_lock:
            tasks = [
                {"task_id": tid, **info}
                for tid, info in _bg_tasks.items()
            ]
        return Response(tasks)


class BackgroundTaskDetailView(APIView):
    """個別タスクのステータス確認 & 完了タスク削除"""

    def get(self, request: Request, task_id: str) -> Response:
        with _bg_tasks_lock:
            task = _bg_tasks.get(task_id)
        if not task:
            return Response({"error": "Task not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"task_id": task_id, **task})

    def delete(self, request: Request, task_id: str) -> Response:
        """完了済みタスクをクリア"""
        with _bg_tasks_lock:
            _bg_tasks.pop(task_id, None)
        return Response(status=status.HTTP_204_NO_CONTENT)


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
            comment = Comment.objects.select_related(
                "ticket__project__space", "ticket__project__jira_space"
            ).get(pk=comment_pk, ticket_id=pk)
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
        is_jira = project.jira_space_id is not None

        try:
            if is_jira:
                from apps.core.services.jira_client import JiraClient

                jira_space = project.jira_space

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
            else:
                from apps.core.services.backlog_client import BacklogClient

                space = project.space

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
        comments = Comment.objects.select_related("ticket__project").filter(
            tags__contains=["spec"],
            posted_at__isnull=True,
        ).exclude(source="synced").order_by("-created_at")
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
            Comment.objects.select_related("ticket__project__space")
            .filter(pk__in=comment_ids, posted_at__isnull=True)
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

        for client in clients.values():
            try:
                asyncio.run(client.close())
            except Exception:
                pass

        return Response({"posted": posted, "errors": errors})


class PinnedTicketListCreateView(APIView):
    """ピン留めチケットの一覧・追加"""

    def get(self, request: Request) -> Response:
        pins = PinnedTicket.objects.select_related(
            "ticket__project", "ticket__assignee"
        ).all()
        data = []
        for pin in pins:
            t = pin.ticket
            data.append({
                "id": pin.pk,
                "ticket": TicketSerializer(t).data,
                "note": pin.note,
                "pinned_at": pin.pinned_at,
            })
        return Response(data)

    def post(self, request: Request) -> Response:
        ticket_id = request.data.get("ticket_id")
        note = request.data.get("note", "")
        if not ticket_id:
            return Response({"error": "ticket_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            ticket = Ticket.objects.get(pk=ticket_id)
        except Ticket.DoesNotExist:
            return Response({"error": "Ticket not found"}, status=status.HTTP_404_NOT_FOUND)
        pin, created = PinnedTicket.objects.get_or_create(ticket=ticket, defaults={"note": note})
        if not created:
            return Response({"error": "既にピン留め済みです"}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            "id": pin.pk,
            "ticket": TicketSerializer(ticket).data,
            "note": pin.note,
            "pinned_at": pin.pinned_at,
        }, status=status.HTTP_201_CREATED)


class PinnedTicketDestroyView(APIView):
    """ピン留め解除"""

    def delete(self, request: Request, pk: int) -> Response:
        try:
            pin = PinnedTicket.objects.get(pk=pk)
        except PinnedTicket.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        pin.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class BacklogSpaceListCreateView(generics.ListCreateAPIView[BacklogSpace]):
    """Backlog スペース一覧・作成 API"""

    serializer_class = BacklogSpaceSerializer
    queryset = BacklogSpace.objects.all()
    pagination_class = None


class BacklogSpaceDetailView(generics.RetrieveUpdateDestroyAPIView[BacklogSpace]):
    """Backlog スペース詳細・更新・削除 API"""

    serializer_class = BacklogSpaceSerializer
    queryset = BacklogSpace.objects.all()


class JiraSpaceListCreateView(generics.ListCreateAPIView[JiraSpace]):
    """Jira スペース一覧・作成 API"""

    serializer_class = JiraSpaceSerializer
    queryset = JiraSpace.objects.all()
    pagination_class = None


class JiraSpaceDetailView(generics.RetrieveUpdateDestroyAPIView[JiraSpace]):
    """Jira スペース詳細・更新・削除 API"""

    serializer_class = JiraSpaceSerializer
    queryset = JiraSpace.objects.all()


class ExcludedStatusListCreateView(generics.ListCreateAPIView[ExcludedStatus]):
    """除外ステータス一覧・作成 API（?project=<id> でプロジェクト絞り込み）"""

    serializer_class = ExcludedStatusSerializer
    pagination_class = None

    def get_queryset(self) -> QuerySet[ExcludedStatus]:
        qs = ExcludedStatus.objects.select_related("project").all()
        project_id = self.request.query_params.get("project")
        space_id = self.request.query_params.get("space")
        jira_space_id = self.request.query_params.get("jira_space")
        if project_id:
            qs = qs.filter(project_id=project_id)
        if space_id:
            qs = qs.filter(project__space_id=space_id)
        elif jira_space_id:
            qs = qs.filter(project__jira_space_id=jira_space_id)
        return qs


class ExcludedStatusDestroyView(generics.DestroyAPIView[ExcludedStatus]):
    """除外ステータス削除 API"""

    serializer_class = ExcludedStatusSerializer
    queryset = ExcludedStatus.objects.all()


class StatusNameListView(APIView):
    """チケットに存在するステータス名一覧 API（?space=<id> / ?project=<id> で絞り込み）"""

    def get(self, request: Request) -> Response:
        qs = Ticket.objects.all()
        space_id = request.query_params.get("space")
        jira_space_id = request.query_params.get("jira_space")
        project_id = request.query_params.get("project")
        if project_id:
            qs = qs.filter(project_id=project_id)
        elif space_id:
            qs = qs.filter(project__space_id=space_id)
        elif jira_space_id:
            qs = qs.filter(project__jira_space_id=jira_space_id)
        names = list(
            qs.values_list("status_name", flat=True)
            .distinct()
            .order_by("status_name")
        )
        return Response(names)


class SyncTriggerView(APIView):
    """同期トリガー API（全スペース or 指定スペース）"""

    def post(self, request: Request) -> Response:
        space_id = request.data.get("space_id")
        try:
            service = SyncService()
            if space_id:
                asyncio.run(service.sync_space(int(space_id)))
            else:
                asyncio.run(service.sync_all())
            return Response({"status": "ok", "message": "Sync completed"})
        except ValueError as e:
            return Response(
                {"status": "error", "message": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception:
            logger.exception("Sync failed")
            return Response(
                {"status": "error", "message": "Sync failed"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class JiraSyncTriggerView(APIView):
    """Jira 同期トリガー API（指定スペース）"""

    def post(self, request: Request, pk: int) -> Response:
        from apps.core.services.jira_sync_service import JiraSyncService

        try:
            service = JiraSyncService()
            asyncio.run(service.sync_space(pk))
            return Response({"status": "ok", "message": "Jira sync completed"})
        except ValueError as e:
            return Response(
                {"status": "error", "message": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception:
            logger.exception("Jira sync failed")
            return Response(
                {"status": "error", "message": "Jira sync failed"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class CodeRepositoryListCreateView(generics.ListCreateAPIView[CodeRepository]):
    """コードリポジトリ一覧・作成 API"""

    serializer_class = CodeRepositorySerializer
    pagination_class = None

    def get_queryset(self) -> QuerySet[CodeRepository]:
        qs = CodeRepository.objects.select_related("project").all()
        project_id = self.request.query_params.get("project")
        if project_id:
            qs = qs.filter(project_id=project_id)
        return qs


class CodeRepositoryDetailView(generics.RetrieveUpdateDestroyAPIView[CodeRepository]):
    """コードリポジトリ詳細・更新・削除 API"""

    serializer_class = CodeRepositorySerializer
    queryset = CodeRepository.objects.all()


class BrowseDirsView(APIView):
    """ホスト上のディレクトリ一覧を返す（eval-proxy 経由）"""

    def post(self, request: Request) -> Response:
        proxy_url = getattr(_settings, "EVAL_PROXY_URL", "http://host.docker.internal:19001")
        try:
            with _httpx.Client(timeout=10.0) as client:
                resp = client.post(f"{proxy_url}/browse-dirs", json=request.data)
                return Response(resp.json(), status=resp.status_code)
        except Exception:
            logger.exception("Failed to browse directories")
            return Response(
                {"error": "ディレクトリ一覧の取得に失敗しました"},
                status=status.HTTP_502_BAD_GATEWAY,
            )
