"""チケットの一覧・CSV 出力・詳細・ピン留め・次工程タグ"""

from __future__ import annotations

import csv
import io
import logging
from typing import TYPE_CHECKING

from django.db.models import BigIntegerField, CharField, Count, Exists, Func, OuterRef, Q, QuerySet, Value
from django.db.models.functions import Cast
from django.http import HttpResponse
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.filters import TicketFilter
from apps.core.models import (
    Comment,
    PinnedTicket,
    Ticket,
    TicketTag,
)
from apps.core.serializers import (
    TicketDetailSerializer,
    TicketSerializer,
    TicketTagSerializer,
)

if TYPE_CHECKING:
    from rest_framework.request import Request


logger = logging.getLogger(__name__)


def _issue_key_sort_annotations() -> dict[str, object]:
    """issue_key を「接頭辞 + 課題番号」に分解してソート用の値を作る。

    issue_key は "PROJECT-1510" のような文字列で、そのまま ORDER BY すると
    辞書順になり 1510 が 216 より前に来てしまう。
    最後の "-" で前後に割り、番号側を数値にキャストして
    「接頭辞 → 番号」の順で並べられるようにする。
    """
    # SUBSTRING_INDEX(key, '-', -1) = 最後の "-" 以降（課題番号）
    number_str = Func(
        "issue_key",
        Value("-"),
        Value(-1),
        function="SUBSTRING_INDEX",
        output_field=CharField(),
    )
    # 桁数の違う番号を数値として比較する。数値化できない形式は 0 になる。
    number = Cast(number_str, output_field=BigIntegerField())
    # 複数プロジェクトが混在しても接頭辞ごとにまとまるようにする
    prefix = Func(
        "issue_key",
        Value("-"),
        Value(1),
        function="SUBSTRING_INDEX",
        output_field=CharField(),
    )
    return {"_key_prefix": prefix, "_key_number": number}


class TicketListView(generics.ListAPIView[Ticket]):
    """チケット一覧 API（フィルタ・検索・ソート対応）"""

    serializer_class = TicketSerializer
    filterset_class = TicketFilter
    search_fields = ["summary", "issue_key"]
    # フロントのソート可能列(TicketTable COLUMNS の sortable)と必ず一致させる。
    # DRF は許可外の ordering を黙って捨てて既定順に戻すため、抜けるとソートが
    # 「効かない」形で無反応になる。
    ordering_fields = [
        "backlog_updated",
        "due_date",
        "priority_id",
        "status_id",
        "issue_key",
        "summary",
        "status_name",
        "priority_name",
    ]
    # issue_key は文字列なので辞書順になる（-1510 が -216 より前）。
    # 課題番号を数値化した別名へ読み替えて自然順で並べる。
    ordering_field_mapping = {"issue_key": ["_key_prefix", "_key_number"]}
    ordering = ["-backlog_updated"]

    def get_queryset(self) -> QuerySet[Ticket]:
        return (
            Ticket.objects.select_related(
                "project",
                "project__space",
                "project__jira_space",
                "assignee",
                "evaluation",
                "parent_ticket",
            )
            .annotate(
                _child_count=Count("child_tickets"),
                _has_spec=Exists(Comment.objects.filter(ticket=OuterRef("pk"), tags__contains=["spec"])),
                _has_report=Exists(Comment.objects.filter(ticket=OuterRef("pk"), tags__contains=["report"])),
                _has_survey=Exists(Comment.objects.filter(ticket=OuterRef("pk"), tags__contains=["survey"])),
                _has_plan=Exists(Comment.objects.filter(ticket=OuterRef("pk"), tags__contains=["plan"])),
                _has_completion=Exists(Comment.objects.filter(ticket=OuterRef("pk"), tags__contains=["completion"])),
                _has_qa=Exists(Comment.objects.filter(ticket=OuterRef("pk"), tags__contains=["qa"])),
                _real_comment_count=Count("comments", filter=Q(comments__content__gt="")),
            )
            .annotate(**_issue_key_sort_annotations())
        )


class TicketExportView(generics.ListAPIView[Ticket]):
    """チケット一覧を CSV エクスポート"""

    serializer_class = TicketSerializer
    filterset_class = TicketFilter
    search_fields = ["summary", "issue_key"]
    # フロントのソート可能列(TicketTable COLUMNS の sortable)と必ず一致させる。
    # DRF は許可外の ordering を黙って捨てて既定順に戻すため、抜けるとソートが
    # 「効かない」形で無反応になる。
    ordering_fields = [
        "backlog_updated",
        "due_date",
        "priority_id",
        "status_id",
        "issue_key",
        "summary",
        "status_name",
        "priority_name",
    ]
    # issue_key は文字列なので辞書順になる（-1510 が -216 より前）。
    # 課題番号を数値化した別名へ読み替えて自然順で並べる。
    ordering_field_mapping = {"issue_key": ["_key_prefix", "_key_number"]}
    ordering = ["-backlog_updated"]
    pagination_class = None  # ページネーション無効

    def get_queryset(self) -> QuerySet[Ticket]:
        return Ticket.objects.select_related("project", "project__space", "project__jira_space", "assignee").annotate(
            **_issue_key_sort_annotations()
        )

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

    # CSV のダウンロードなので Response ではなく HttpResponse を返す（DRF はどちらも扱える）
    def list(self, request: Request, *args: object, **kwargs: object) -> HttpResponse:  # type: ignore[override]
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


class TicketDetailView(generics.RetrieveAPIView[Ticket]):
    """チケット詳細 API（評価・方針書含む）"""

    serializer_class = TicketDetailSerializer

    def get_queryset(self) -> QuerySet[Ticket]:
        return Ticket.objects.select_related(
            "project",
            "project__space",
            "project__jira_space",
            "assignee",
            "evaluation",
            "parent_ticket",
        ).annotate(_child_count=Count("child_tickets"))


class PinnedTicketListCreateView(APIView):
    """ピン留めチケットの一覧・追加"""

    def get(self, request: Request) -> Response:
        pins = PinnedTicket.objects.select_related("ticket__project", "ticket__assignee").all()
        data = []
        for pin in pins:
            t = pin.ticket
            data.append(
                {
                    "id": pin.pk,
                    "ticket": TicketSerializer(t).data,
                    "note": pin.note,
                    "pinned_at": pin.pinned_at,
                }
            )
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
        return Response(
            {
                "id": pin.pk,
                "ticket": TicketSerializer(ticket).data,
                "note": pin.note,
                "pinned_at": pin.pinned_at,
            },
            status=status.HTTP_201_CREATED,
        )


class PinnedTicketDestroyView(APIView):
    """ピン留め解除"""

    def delete(self, request: Request, pk: int) -> Response:
        try:
            pin = PinnedTicket.objects.get(pk=pk)
        except PinnedTicket.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        pin.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TicketTagListCreateView(generics.ListCreateAPIView[TicketTag]):
    """次工程タグ一覧・作成 API"""

    serializer_class = TicketTagSerializer
    queryset = TicketTag.objects.all()
    pagination_class = None


class TicketTagDetailView(generics.RetrieveUpdateDestroyAPIView[TicketTag]):
    """次工程タグ詳細・更新・削除 API"""

    serializer_class = TicketTagSerializer
    queryset = TicketTag.objects.all()


class TicketUpdateCustomTagsView(APIView):
    """チケットの次工程タグ更新 API"""

    def patch(self, request: Request, pk: int) -> Response:
        try:
            ticket = Ticket.objects.get(pk=pk)
        except Ticket.DoesNotExist:
            return Response({"error": "Ticket not found"}, status=status.HTTP_404_NOT_FOUND)

        tags = request.data.get("custom_tags")
        if tags is None:
            return Response({"error": "custom_tags is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(tags, list) or not all(isinstance(t, str) for t in tags):
            return Response({"error": "custom_tags must be a list of strings"}, status=status.HTTP_400_BAD_REQUEST)

        ticket.custom_tags = tags
        ticket.save(update_fields=["custom_tags"])
        return Response({"custom_tags": ticket.custom_tags})
