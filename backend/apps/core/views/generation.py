"""AI 生成（難易度評価・方針書・QA 項目・各種文書）と、そのバックグラウンドタスクの状態"""

from __future__ import annotations

import logging
import threading
import uuid
from typing import TYPE_CHECKING

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models import (
    Ticket,
)
from apps.core.serializers import (
    TicketEvaluationSerializer,
)
from apps.core.services.evaluation_service import (
    evaluate_ticket,
    generate_document,
    generate_qa_items,
    generate_spec,
)

if TYPE_CHECKING:
    from rest_framework.request import Request


from apps.core.views._shared import _bg_tasks, _bg_tasks_lock

logger = logging.getLogger(__name__)


class TicketEvaluateView(APIView):
    """チケット AI 評価トリガー API"""

    def post(self, request: Request, pk: int) -> Response:
        try:
            ticket = Ticket.objects.select_related("project", "project__space", "project__jira_space", "assignee").get(
                pk=pk
            )
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
        ticket = Ticket.objects.select_related("project", "project__space", "project__jira_space", "assignee").get(
            pk=ticket_id
        )
        comment = generate_spec(ticket)
        with _bg_tasks_lock:
            _bg_tasks[task_id].update(
                {
                    "status": "completed",
                    "comment_id": comment.pk,
                    "issue_key": ticket.issue_key,
                }
            )
    except Exception as e:
        logger.exception("Background spec generation failed for ticket %d", ticket_id)
        with _bg_tasks_lock:
            _bg_tasks[task_id].update(
                {
                    "status": "failed",
                    "error": str(e),
                }
            )


class TicketGenerateSpecView(APIView):
    """方針書生成 API（バックグラウンド実行）"""

    def post(self, request: Request, pk: int) -> Response:
        try:
            ticket = Ticket.objects.select_related("project", "project__space", "project__jira_space", "assignee").get(
                pk=pk
            )
        except Ticket.DoesNotExist:
            return Response(
                {"error": "Ticket not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        task_id = str(uuid.uuid4())
        with _bg_tasks_lock:
            _bg_tasks[task_id] = {
                "status": "running",
                "task_type": "spec",
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


def _run_qa_generation(task_id: str, ticket_id: int) -> None:
    """バックグラウンドで QA テスト項目生成を実行"""
    import django

    django.setup()
    try:
        ticket = Ticket.objects.select_related("project", "project__space", "project__jira_space", "assignee").get(
            pk=ticket_id
        )
        qa_items, comment = generate_qa_items(ticket)
        with _bg_tasks_lock:
            _bg_tasks[task_id].update(
                {
                    "status": "completed",
                    "comment_id": comment.pk,
                    "issue_key": ticket.issue_key,
                    "qa_items": qa_items,
                }
            )
    except Exception as e:
        logger.exception("Background QA generation failed for ticket %d", ticket_id)
        with _bg_tasks_lock:
            _bg_tasks[task_id].update(
                {
                    "status": "failed",
                    "error": str(e),
                }
            )


class TicketGenerateQAView(APIView):
    """QA テスト項目生成 API（バックグラウンド実行）"""

    def post(self, request: Request, pk: int) -> Response:
        try:
            ticket = Ticket.objects.select_related("project", "project__space", "project__jira_space", "assignee").get(
                pk=pk
            )
        except Ticket.DoesNotExist:
            return Response(
                {"error": "Ticket not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        task_id = str(uuid.uuid4())
        with _bg_tasks_lock:
            _bg_tasks[task_id] = {
                "status": "running",
                "task_type": "qa",
                "ticket_id": pk,
                "issue_key": ticket.issue_key,
                "summary": ticket.summary,
                "started_at": timezone.now().isoformat(),
            }

        thread = threading.Thread(
            target=_run_qa_generation,
            args=(task_id, pk),
            daemon=True,
        )
        thread.start()

        return Response(
            {"task_id": task_id, "status": "running"},
            status=status.HTTP_202_ACCEPTED,
        )


# 調査報告書 / 実装計画書 / 実装記録 / 完了コメント の生成種別
# URL の <str:kind> で受け取り、evaluation_service.generate_document に渡す。
_DOCUMENT_KINDS = {"survey", "plan", "record", "completion"}


def _run_document_generation(task_id: str, ticket_id: int, kind: str) -> None:
    """バックグラウンドでドキュメント生成（survey/plan/record/completion）を実行"""
    import django

    django.setup()
    try:
        ticket = Ticket.objects.select_related("project", "project__space", "project__jira_space", "assignee").get(
            pk=ticket_id
        )
        comment = generate_document(ticket, kind)
        with _bg_tasks_lock:
            _bg_tasks[task_id].update(
                {
                    "status": "completed",
                    "comment_id": comment.pk,
                    "issue_key": ticket.issue_key,
                }
            )
    except Exception as e:
        logger.exception("Background %s generation failed for ticket %d", kind, ticket_id)
        with _bg_tasks_lock:
            _bg_tasks[task_id].update(
                {
                    "status": "failed",
                    "error": str(e),
                }
            )


class TicketGenerateDocumentView(APIView):
    """調査報告書 / 実装計画書 / 実装記録 / 完了コメント 生成 API（バックグラウンド実行）"""

    def post(self, request: Request, pk: int, kind: str) -> Response:
        if kind not in _DOCUMENT_KINDS:
            return Response(
                {"error": f"Unknown kind: {kind}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            ticket = Ticket.objects.select_related("project", "project__space", "project__jira_space", "assignee").get(
                pk=pk
            )
        except Ticket.DoesNotExist:
            return Response(
                {"error": "Ticket not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        task_id = str(uuid.uuid4())
        with _bg_tasks_lock:
            _bg_tasks[task_id] = {
                "status": "running",
                "task_type": kind,
                "ticket_id": pk,
                "issue_key": ticket.issue_key,
                "summary": ticket.summary,
                "started_at": timezone.now().isoformat(),
            }

        thread = threading.Thread(
            target=_run_document_generation,
            args=(task_id, pk, kind),
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
            tasks = [{"task_id": tid, **info} for tid, info in _bg_tasks.items()]
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
