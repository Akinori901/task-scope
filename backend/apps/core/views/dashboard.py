"""ダッシュボードの集計 API"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from django.db.models import Count, Q
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models import (
    BacklogSpace,
    BacklogUser,
    Comment,
    ExcludedStatus,
    Project,
    Ticket,
)
from apps.core.serializers import (
    DashboardStatsSerializer,
)
from apps.core.services.sync_service import NOT_STARTED_STATUS_NAMES

if TYPE_CHECKING:
    from rest_framework.request import Request


from apps.core.views._shared import _int_param

logger = logging.getLogger(__name__)


class DashboardStatsView(APIView):
    """ダッシュボード集計 API"""

    def get(self, request: Request) -> Response:
        view_mode = request.query_params.get("view", "all")
        space_id = _int_param(request.query_params, "space")
        jira_space_id = _int_param(request.query_params, "jira_space")
        project_id = _int_param(request.query_params, "project")
        status_name = request.query_params.get("status_name")
        assignee_id = _int_param(request.query_params, "assignee")
        category = request.query_params.get("category")
        milestone = request.query_params.get("milestone")
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
        if category:
            tickets = tickets.filter(categories__contains=[category])
        if milestone:
            tickets = tickets.filter(milestone_names__contains=[milestone])
        if search:
            tickets = tickets.filter(Q(summary__icontains=search) | Q(issue_key__icontains=search))

        # 自分ビューのフィルタ
        myself_users = list(BacklogUser.objects.filter(is_myself=True))
        if view_mode == "my" and myself_users:
            myself_ids = [u.id for u in myself_users]
            mentioned_ticket_ids = list(
                Comment.objects.filter(mentioned_users__id__in=myself_ids).values_list("ticket_id", flat=True)
            )
            tickets = tickets.filter(Q(assignee__in=myself_ids) | Q(id__in=mentioned_ticket_ids)).distinct()

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
        status_distribution = [{"status": item["status_name"], "count": item["count"]} for item in status_dist]

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
