import django_filters
from django.db.models import Q

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

    def filter_is_root(self, queryset, name, value):  # type: ignore[no-untyped-def]
        if value is not None:
            return queryset.filter(parent_ticket__isnull=value)
        return queryset
