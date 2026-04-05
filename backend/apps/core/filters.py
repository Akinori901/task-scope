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

    class Meta:
        model = Ticket
        fields = {
            "status_name": ["exact"],
            "priority_name": ["exact"],
            "assignee": ["exact"],
            "is_overdue": ["exact"],
            "is_stagnant": ["exact"],
        }

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
