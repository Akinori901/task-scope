"""設定画面で扱うもの（プロジェクト・ユーザー・スペース・除外ステータス・リポジトリ）"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import httpx as _httpx
from django.conf import settings as _settings
from django.db.models import Count, Q, QuerySet
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models import (
    BacklogSpace,
    BacklogUser,
    CodeRepository,
    ExcludedStatus,
    JiraSpace,
    Project,
    Ticket,
)
from apps.core.serializers import (
    BacklogSpaceSerializer,
    BacklogUserSerializer,
    CodeRepositorySerializer,
    ExcludedStatusSerializer,
    JiraSpaceSerializer,
    ProjectSerializer,
)
from apps.core.services.evaluation_service import (
    proxy_headers,
)

if TYPE_CHECKING:
    from rest_framework.request import Request


from apps.core.views._shared import _int_param

logger = logging.getLogger(__name__)


class ProjectListView(generics.ListAPIView[Project]):
    """プロジェクト一覧 API"""

    serializer_class = ProjectSerializer

    def get_queryset(self) -> QuerySet[Project]:
        qs = Project.objects.filter(is_active=True)
        space_id = _int_param(self.request.query_params, "space")
        jira_space_id = _int_param(self.request.query_params, "jira_space")
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
        space_id = _int_param(self.request.query_params, "space")
        jira_space_id = _int_param(self.request.query_params, "jira_space")
        if space_id:
            qs = qs.filter(space_id=space_id)
        elif jira_space_id:
            qs = qs.filter(jira_space_id=jira_space_id)
        return qs


class BacklogUserUpdateView(generics.UpdateAPIView[BacklogUser]):
    """ユーザー更新 API（is_myself トグル用）"""

    queryset = BacklogUser.objects.all()
    serializer_class = BacklogUserSerializer


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
        project_id = _int_param(self.request.query_params, "project")
        space_id = _int_param(self.request.query_params, "space")
        jira_space_id = _int_param(self.request.query_params, "jira_space")
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
        space_id = _int_param(request.query_params, "space")
        jira_space_id = _int_param(request.query_params, "jira_space")
        project_id = _int_param(request.query_params, "project")
        if project_id:
            qs = qs.filter(project_id=project_id)
        elif space_id:
            qs = qs.filter(project__space_id=space_id)
        elif jira_space_id:
            qs = qs.filter(project__jira_space_id=jira_space_id)
        names = list(qs.values_list("status_name", flat=True).distinct().order_by("status_name"))
        return Response(names)


class CategoryNameListView(APIView):
    """チケットに存在するカテゴリ名一覧 API"""

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
        # JSON 配列からユニークな値を抽出
        names: set[str] = set()
        for cats in qs.exclude(categories=[]).values_list("categories", flat=True).iterator():
            if isinstance(cats, list):
                names.update(cats)
        return Response(sorted(names))


class CodeRepositoryListCreateView(generics.ListCreateAPIView[CodeRepository]):
    """コードリポジトリ一覧・作成 API"""

    serializer_class = CodeRepositorySerializer
    pagination_class = None

    def get_queryset(self) -> QuerySet[CodeRepository]:
        qs = CodeRepository.objects.select_related("project").all()
        project_id = _int_param(self.request.query_params, "project")
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
                resp = client.post(f"{proxy_url}/browse-dirs", json=request.data, headers=proxy_headers())
                return Response(resp.json(), status=resp.status_code)
        except Exception:
            logger.exception("Failed to browse directories")
            return Response(
                {"error": "ディレクトリ一覧の取得に失敗しました"},
                status=status.HTTP_502_BAD_GATEWAY,
            )
