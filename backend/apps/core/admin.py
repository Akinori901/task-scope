from django.contrib import admin

from apps.core.models import BacklogSpace, BacklogUser, CodeRepository, Comment, Project, Ticket, TicketEvaluation


@admin.register(BacklogSpace)
class BacklogSpaceAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = ("space_key", "domain", "last_synced_at")


@admin.register(BacklogUser)
class BacklogUserAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = ("name", "user_id_str", "is_myself", "space")
    list_filter = ("is_myself", "space")


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = ("project_key", "name", "is_active", "last_synced_at")
    list_filter = ("is_active", "space")


@admin.register(CodeRepository)
class CodeRepositoryAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = ("name", "project", "local_path", "match_field", "match_value", "is_active")
    list_filter = ("project", "is_active")


@admin.register(Ticket)
class TicketAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = ("issue_key", "summary", "status_name", "assignee", "due_date", "is_overdue", "is_stagnant")
    list_filter = ("status_name", "is_overdue", "is_stagnant", "project")
    search_fields = ("issue_key", "summary")


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = ("backlog_id", "ticket", "created_user", "tags", "source", "backlog_created")


@admin.register(TicketEvaluation)
class TicketEvaluationAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = ("ticket", "info_completeness_score", "spec_readiness", "schedule_feasibility", "evaluated_at")
    list_filter = ("spec_readiness", "schedule_feasibility")


