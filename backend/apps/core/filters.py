import django_filters
from django.db.models import Q
from rest_framework import filters

from apps.core.models import ExcludedStatus, Ticket
from apps.core.services.sync_service import CLOSED_STATUS_NAMES


class TicketFilter(django_filters.FilterSet):  # type: ignore[type-arg]
    project = django_filters.NumberFilter(field_name="project_id")
    space = django_filters.NumberFilter(field_name="project__space_id")
    jira_space = django_filters.NumberFilter(field_name="project__jira_space_id")
    view = django_filters.CharFilter(method="filter_view")
    exclude_completed = django_filters.BooleanFilter(method="filter_exclude_completed")
    status_name = django_filters.CharFilter(method="filter_status_name")
    category = django_filters.CharFilter(method="filter_category")
    milestone = django_filters.CharFilter(method="filter_milestone")
    custom_tag = django_filters.CharFilter(method="filter_custom_tag")
    is_root = django_filters.BooleanFilter(method="filter_is_root")
    parent_id = django_filters.NumberFilter(field_name="parent_ticket_id")

    class Meta:
        model = Ticket
        fields = {
            "priority_name": ["exact"],
            "assignee": ["exact"],
            "is_overdue": ["exact"],
            "is_stagnant": ["exact"],
            "is_watched": ["exact"],
        }

    def filter_status_name(self, queryset, name, value):  # type: ignore[no-untyped-def]
        if value:
            names = [v.strip() for v in value.split(",")]
            if len(names) == 1:
                return queryset.filter(status_name=names[0])
            return queryset.filter(status_name__in=names)
        return queryset

    def filter_view(self, queryset, name, value):  # type: ignore[no-untyped-def]
        if value == "my":
            from apps.core.models import BacklogUser, Comment

            myself_ids = list(
                BacklogUser.objects.filter(is_myself=True).values_list("id", flat=True)
            )
            if myself_ids:
                mentioned_ticket_ids = Comment.objects.filter(
                    mentioned_users__id__in=myself_ids
                ).values_list("ticket_id", flat=True)
                queryset = queryset.filter(
                    Q(assignee__in=myself_ids)
                    | Q(id__in=mentioned_ticket_ids)
                ).distinct()
        return queryset

    def filter_exclude_completed(self, queryset, name, value):  # type: ignore[no-untyped-def]
        if value:
            excluded = CLOSED_STATUS_NAMES | ExcludedStatus.get_excluded_names()
            queryset = queryset.exclude(status_name__in=excluded)
        return queryset

    def filter_category(self, queryset, name, value):  # type: ignore[no-untyped-def]
        if value:
            return queryset.filter(categories__contains=[value])
        return queryset

    def filter_milestone(self, queryset, name, value):  # type: ignore[no-untyped-def]
        if value:
            return queryset.filter(milestone_names__contains=[value])
        return queryset

    def filter_custom_tag(self, queryset, name, value):  # type: ignore[no-untyped-def]
        if value:
            return queryset.filter(custom_tags__contains=[value])
        return queryset

    def filter_is_root(self, queryset, name, value):  # type: ignore[no-untyped-def]
        if value is not None:
            return queryset.filter(parent_ticket__isnull=value)
        return queryset


class MappedOrderingFilter(filters.OrderingFilter):
    """ordering の項目名を、実際に並べ替えに使う式へ読み替える OrderingFilter。

    View に `ordering_field_mapping = {"issue_key": ["_key_prefix", "_key_number"]}`
    を置くと、`?ordering=issue_key` を `_key_prefix, _key_number` の順で
    並べ替える。降順(`-issue_key`)は展開後の全項目に反映する。

    issue_key のような "PREFIX-123" 形式の文字列は、そのまま ORDER BY すると
    辞書順になり -1510 が -216 より前に来てしまうため、数値化した注釈へ
    差し替えるのに使う。
    """

    def get_ordering(self, request, queryset, view):  # type: ignore[no-untyped-def]
        ordering = super().get_ordering(request, queryset, view)
        if not ordering:
            return ordering
        mapping = getattr(view, "ordering_field_mapping", None)
        if not mapping:
            return ordering
        expanded: list[str] = []
        for term in ordering:
            desc = term.startswith("-")
            field = term[1:] if desc else term
            replacement = mapping.get(field)
            if replacement is None:
                expanded.append(term)
                continue
            expanded.extend(f"-{r}" if desc else r for r in replacement)
        return expanded
