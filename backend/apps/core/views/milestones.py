"""マイルストーンとガントチャート"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from django.db.models import Q, QuerySet
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models import (
    BacklogUser,
    Comment,
    ExcludedStatus,
    Milestone,
    Ticket,
)
from apps.core.serializers import (
    MilestoneSerializer,
)
from apps.core.services.sync_service import NOT_STARTED_STATUS_NAMES

if TYPE_CHECKING:
    from rest_framework.request import Request


from apps.core.views._shared import _int_param

logger = logging.getLogger(__name__)


class MilestoneNameListView(APIView):
    """チケットに存在するマイルストーン名一覧 API"""

    def get(self, request: Request) -> Response:
        qs = Ticket.objects.all()
        space_id = _int_param(request.query_params, "space")
        jira_space_id = _int_param(request.query_params, "jira_space")
        project_id = _int_param(request.query_params, "project")
        if project_id:
            qs = qs.filter(project_id=project_id)
        elif space_id:
            qs = qs.filter(project__space_id=space_id)
        elif jira_space_id:
            qs = qs.filter(project__jira_space_id=jira_space_id)
        names: set[str] = set()
        for ms in qs.exclude(milestone_names=[]).values_list("milestone_names", flat=True).iterator():
            if isinstance(ms, list):
                names.update(ms)
        return Response(sorted(names))


class GanttMilestoneListView(APIView):
    """ガントチャート用マイルストーン集計 API"""

    def get(self, request: Request) -> Response:
        from apps.core.services.sync_service import CLOSED_STATUS_NAMES

        # --- マイルストーン取得（日付ありのみ）---
        ms_qs = Milestone.objects.select_related("project").filter(
            start_date__isnull=False,
            end_date__isnull=False,
        )
        space_id = _int_param(request.query_params, "space")
        jira_space_id = _int_param(request.query_params, "jira_space")
        project_id = _int_param(request.query_params, "project")
        if project_id:
            ms_qs = ms_qs.filter(project_id=project_id)
        elif space_id:
            ms_qs = ms_qs.filter(project__space_id=space_id)
        elif jira_space_id:
            ms_qs = ms_qs.filter(project__jira_space_id=jira_space_id)

        milestones = list(ms_qs.order_by("sort_order", "start_date"))
        if not milestones:
            return Response([])

        ms_names = [ms.name for ms in milestones]

        # --- チケット取得（フィルタ適用）---
        tickets_qs = Ticket.objects.all()
        # TicketFilter のパラメータを手動適用
        if project_id:
            tickets_qs = tickets_qs.filter(project_id=project_id)
        elif space_id:
            tickets_qs = tickets_qs.filter(project__space_id=space_id)
        elif jira_space_id:
            tickets_qs = tickets_qs.filter(project__jira_space_id=jira_space_id)

        status_name = request.query_params.get("status_name")
        if status_name:
            tickets_qs = tickets_qs.filter(status_name=status_name)
        assignee_id = _int_param(request.query_params, "assignee")
        if assignee_id:
            tickets_qs = tickets_qs.filter(assignee_id=assignee_id)
        category = request.query_params.get("category")
        if category:
            tickets_qs = tickets_qs.filter(categories__contains=[category])
        search = request.query_params.get("search")
        if search:
            tickets_qs = tickets_qs.filter(Q(summary__icontains=search) | Q(issue_key__icontains=search))
        view_mode = request.query_params.get("view")
        if view_mode == "my":
            myself_ids = list(BacklogUser.objects.filter(is_myself=True).values_list("id", flat=True))
            if myself_ids:
                mentioned_ticket_ids = Comment.objects.filter(mentioned_users__id__in=myself_ids).values_list(
                    "ticket_id", flat=True
                )
                tickets_qs = tickets_qs.filter(Q(assignee__in=myself_ids) | Q(id__in=mentioned_ticket_ids)).distinct()

        exclude_completed = request.query_params.get("exclude_completed")
        project_ids = list(ms_qs.values_list("project_id", flat=True).distinct())
        excluded_names = ExcludedStatus.get_excluded_names(project_ids)
        completed_names = CLOSED_STATUS_NAMES | excluded_names
        if exclude_completed and exclude_completed.lower() in ("true", "1"):
            tickets_qs = tickets_qs.exclude(status_name__in=completed_names)

        # 対象マイルストーン名のいずれかを含むチケットのみ取得
        # JSONField の OR 条件を構築
        ms_q = Q()
        for name in ms_names:
            ms_q |= Q(milestone_names__contains=[name])
        # --- マイルストーン別に集計 ---
        stats_by_name: dict[str, dict[str, int]] = {}
        for name in ms_names:
            stats_by_name[name] = {
                "total": 0,
                "completed": 0,
                "in_progress": 0,
                "not_started": 0,
                "stagnant": 0,
                "overdue": 0,
            }

        for ticket in (
            tickets_qs.filter(ms_q).only("id", "status_name", "is_stagnant", "is_overdue", "milestone_names").iterator()
        ):
            for name in ticket.milestone_names or []:
                if name not in stats_by_name:
                    continue
                s = stats_by_name[name]
                s["total"] += 1
                if ticket.status_name in completed_names:
                    s["completed"] += 1
                elif ticket.is_overdue:
                    s["overdue"] += 1
                elif ticket.status_name in NOT_STARTED_STATUS_NAMES:
                    s["not_started"] += 1
                elif ticket.is_stagnant:
                    s["stagnant"] += 1
                else:
                    s["in_progress"] += 1

        # --- レスポンス構築 ---
        result = []
        for ms in milestones:
            s = stats_by_name.get(
                ms.name, {"total": 0, "completed": 0, "in_progress": 0, "not_started": 0, "stagnant": 0, "overdue": 0}
            )
            rate = round(s["completed"] / s["total"] * 100, 1) if s["total"] > 0 else 0.0
            result.append(
                {
                    "id": ms.id,
                    "project_key": ms.project.project_key,
                    "project_name": ms.project.name,
                    "name": ms.name,
                    "start_date": ms.start_date.isoformat() if ms.start_date else None,
                    "end_date": ms.end_date.isoformat() if ms.end_date else None,
                    "sort_order": ms.sort_order,
                    "stats": {**s, "completion_rate": rate},
                }
            )

        return Response(result)


class MilestoneListCreateView(generics.ListCreateAPIView[Milestone]):
    """マイルストーン一覧・作成 API"""

    serializer_class = MilestoneSerializer
    pagination_class = None

    def get_queryset(self) -> QuerySet[Milestone]:
        qs = Milestone.objects.select_related("project").all()
        project_id = _int_param(self.request.query_params, "project")
        space_id = _int_param(self.request.query_params, "space")
        jira_space_id = _int_param(self.request.query_params, "jira_space")
        if project_id:
            qs = qs.filter(project_id=project_id)
        elif space_id:
            qs = qs.filter(project__space_id=space_id)
        elif jira_space_id:
            qs = qs.filter(project__jira_space_id=jira_space_id)
        return qs


class MilestoneDetailView(generics.RetrieveUpdateDestroyAPIView[Milestone]):
    """マイルストーン詳細・更新・削除 API"""

    serializer_class = MilestoneSerializer
    queryset = Milestone.objects.all()
