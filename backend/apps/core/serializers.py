from django.db.models import Count
from rest_framework import serializers

from apps.core.models import BacklogSpace, BacklogUser, CodeRepository, Comment, ExcludedStatus, JiraSpace, Milestone, Project, Ticket, TicketEvaluation


class BacklogSpaceSerializer(serializers.ModelSerializer[BacklogSpace]):
    class Meta:
        model = BacklogSpace
        fields = ["id", "space_key", "domain", "api_key", "last_synced_at", "sync_interval_minutes", "created_at", "updated_at"]
        extra_kwargs = {
            "api_key": {"write_only": True},
        }

    def to_representation(self, instance: BacklogSpace) -> dict:
        data = super().to_representation(instance)
        # API キーはマスクして返す
        data["api_key_masked"] = instance.api_key[:4] + "****" if instance.api_key else ""
        return data


class JiraSpaceSerializer(serializers.ModelSerializer[JiraSpace]):
    class Meta:
        model = JiraSpace
        fields = ["id", "site_name", "base_url", "user_email", "api_token", "last_synced_at", "created_at", "updated_at"]
        extra_kwargs = {
            "api_token": {"write_only": True},
        }

    def to_representation(self, instance: JiraSpace) -> dict:
        data = super().to_representation(instance)
        data["api_token_masked"] = instance.api_token[:4] + "****" if instance.api_token else ""
        return data


class ExcludedStatusSerializer(serializers.ModelSerializer[ExcludedStatus]):
    project_key = serializers.CharField(source="project.project_key", read_only=True)

    class Meta:
        model = ExcludedStatus
        fields = ["id", "project", "project_key", "status_name"]


class MilestoneSerializer(serializers.ModelSerializer["Milestone"]):
    project_key = serializers.CharField(source="project.project_key", read_only=True)
    project_name = serializers.CharField(source="project.name", read_only=True)

    class Meta:
        model = Milestone
        fields = [
            "id", "project", "project_key", "project_name",
            "name", "start_date", "end_date", "sort_order",
            "created_at", "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class CodeRepositorySerializer(serializers.ModelSerializer[CodeRepository]):
    project_name = serializers.CharField(source="project.name", read_only=True)
    project_key = serializers.CharField(source="project.project_key", read_only=True)

    class Meta:
        model = CodeRepository
        fields = [
            "id", "project", "project_name", "project_key",
            "name", "local_path", "match_field", "match_value",
            "description", "is_active", "created_at", "updated_at",
        ]


class BacklogUserSerializer(serializers.ModelSerializer[BacklogUser]):
    class Meta:
        model = BacklogUser
        fields = ["id", "backlog_id", "user_id_str", "name", "mail_address", "is_myself"]


class ProjectSerializer(serializers.ModelSerializer[Project]):
    ticket_count = serializers.IntegerField(read_only=True, default=0)
    completed_count = serializers.IntegerField(read_only=True, default=0)
    overdue_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Project
        fields = [
            "id",
            "backlog_id",
            "project_key",
            "name",
            "is_active",
            "last_synced_at",
            "ticket_count",
            "completed_count",
            "overdue_count",
        ]


class TicketEvaluationSerializer(serializers.ModelSerializer[TicketEvaluation]):
    class Meta:
        model = TicketEvaluation
        fields = [
            "id",
            # 難易度6軸
            "impact_scope_score",
            "query_complexity_score",
            "ambiguity_score",
            "verification_difficulty_score",
            "coordination_cost_score",
            "regression_risk_score",
            "overall_difficulty_score",
            "difficulty_comment",
            # 対処区分
            "resolution_type",
            "resolution_comment",
            # 推定工数
            "estimated_days",
            "estimated_breakdown",
            # 情報品質
            "info_completeness_score",
            "missing_items",
            "spec_readiness",
            "schedule_feasibility",
            "schedule_comment",
            "summary",
            "pr_urls",
            "comment_count_at_eval",
            "model_used",
            "evaluated_at",
        ]


class CommentSerializer(serializers.ModelSerializer[Comment]):
    created_user_name = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = [
            "id",
            "content",
            "created_user_name",
            "has_attachments",
            "tags",
            "source",
            "posted_at",
            "backlog_created",
        ]

    def get_created_user_name(self, obj: Comment) -> str | None:
        if obj.created_user:
            return obj.created_user.name
        return None


class TicketSerializer(serializers.ModelSerializer[Ticket]):
    project_key = serializers.CharField(source="project.project_key", read_only=True)
    project_name = serializers.CharField(source="project.name", read_only=True)
    assignee_name = serializers.SerializerMethodField()
    parent_ticket_id = serializers.IntegerField(
        source="parent_ticket.id", read_only=True, default=None
    )
    parent_ticket_key = serializers.CharField(
        source="parent_ticket.issue_key", read_only=True, default=None
    )
    child_count = serializers.SerializerMethodField()
    source_type = serializers.SerializerMethodField()
    external_url = serializers.SerializerMethodField()
    has_evaluation = serializers.SerializerMethodField()
    has_spec = serializers.SerializerMethodField()
    needs_re_evaluation = serializers.SerializerMethodField()
    new_comment_count = serializers.SerializerMethodField()
    spec_readiness = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = [
            "id",
            "backlog_id",
            "issue_key",
            "summary",
            "issue_type",
            "status_name",
            "status_id",
            "priority_name",
            "priority_id",
            "assignee",
            "assignee_name",
            "project_key",
            "project_name",
            "parent_ticket_id",
            "parent_ticket_key",
            "child_count",
            "start_date",
            "due_date",
            "estimated_hours",
            "actual_hours",
            "comment_count",
            "last_comment_at",
            "backlog_created",
            "backlog_updated",
            "is_overdue",
            "is_stagnant",
            "is_watched",
            "stagnant_days",
            "previous_status_name",
            "status_changed_at",
            "source_type",
            "external_url",
            "has_evaluation",
            "has_spec",
            "needs_re_evaluation",
            "new_comment_count",
            "spec_readiness",
        ]

    def get_child_count(self, obj: Ticket) -> int:
        if hasattr(obj, "_child_count"):
            return obj._child_count  # type: ignore[return-value]
        return obj.child_tickets.count()

    def get_source_type(self, obj: Ticket) -> str:
        if obj.project.jira_space_id:
            return "jira"
        return "backlog"

    def get_external_url(self, obj: Ticket) -> str | None:
        project = obj.project
        if project.jira_space_id:
            base = project.jira_space.base_url.rstrip("/")
            return f"{base}/browse/{obj.issue_key}"
        if project.space_id:
            space = project.space
            return f"https://{space.space_key}.{space.domain}/view/{obj.issue_key}"
        return None

    def get_assignee_name(self, obj: Ticket) -> str | None:
        if obj.assignee:
            return obj.assignee.name
        return None

    def get_has_evaluation(self, obj: Ticket) -> bool:
        return hasattr(obj, "evaluation") and obj.evaluation is not None

    def get_has_spec(self, obj: Ticket) -> bool:
        if hasattr(obj, "_has_spec"):
            return obj._has_spec  # type: ignore[return-value]
        return Comment.objects.filter(ticket=obj, tags__contains=["spec"]).exists()

    def get_needs_re_evaluation(self, obj: Ticket) -> bool:
        try:
            ev = obj.evaluation
            if ev is None:
                return False
            real_count = getattr(obj, "_real_comment_count", None)
            if real_count is None:
                real_count = obj.comments.exclude(content="").count()
            return real_count > ev.comment_count_at_eval
        except TicketEvaluation.DoesNotExist:
            return False

    def get_new_comment_count(self, obj: Ticket) -> int:
        """評価後に追加された実コメント数（変更ログ除外）"""
        try:
            ev = obj.evaluation
            if ev is None:
                return 0
            real_count = getattr(obj, "_real_comment_count", None)
            if real_count is None:
                real_count = obj.comments.exclude(content="").count()
            diff = real_count - ev.comment_count_at_eval
            return max(0, diff)
        except TicketEvaluation.DoesNotExist:
            return 0

    def get_spec_readiness(self, obj: Ticket) -> str | None:
        try:
            return obj.evaluation.spec_readiness
        except TicketEvaluation.DoesNotExist:
            return None


class TicketDetailSerializer(TicketSerializer):
    evaluation = TicketEvaluationSerializer(read_only=True)
    comments = serializers.SerializerMethodField()
    description = serializers.CharField()
    matched_repositories = serializers.SerializerMethodField()
    children = serializers.SerializerMethodField()

    class Meta(TicketSerializer.Meta):
        fields = [
            *TicketSerializer.Meta.fields,
            "description",
            "evaluation",
            "comments",
            "custom_fields",
            "matched_repositories",
            "children",
        ]

    def get_comments(self, obj: Ticket) -> list[dict]:
        # 変化ログ（content が空）は除外
        qs = obj.comments.exclude(content="").select_related("created_user").order_by("backlog_created")
        return CommentSerializer(qs, many=True).data

    def get_children(self, obj: Ticket) -> list[dict]:
        children = (
            obj.child_tickets.select_related(
                "project", "project__space", "project__jira_space",
                "assignee", "evaluation", "parent_ticket",
            )
            .annotate(_child_count=Count("child_tickets"))
            .order_by("issue_key")
        )
        return TicketSerializer(children, many=True).data

    def get_matched_repositories(self, obj: Ticket) -> list[dict]:
        from apps.core.services.evaluation_service import resolve_repositories

        repos = resolve_repositories(obj)
        return [{"id": r.id, "name": r.name, "description": r.description} for r in repos]


class StatusDistributionSerializer(serializers.Serializer[dict[str, object]]):
    status = serializers.CharField()
    count = serializers.IntegerField()


class AssigneeWorkloadSerializer(serializers.Serializer[dict[str, object]]):
    name = serializers.CharField()
    total = serializers.IntegerField()
    overdue = serializers.IntegerField()


class DashboardStatsSerializer(serializers.Serializer[dict[str, object]]):
    total_tickets = serializers.IntegerField()
    completed_tickets = serializers.IntegerField()
    not_started_tickets = serializers.IntegerField()
    incomplete_tickets = serializers.IntegerField()
    overdue_tickets = serializers.IntegerField()
    stagnant_tickets = serializers.IntegerField()
    completion_rate = serializers.FloatField()
    my_total = serializers.IntegerField()
    my_overdue = serializers.IntegerField()
    my_stagnant = serializers.IntegerField()
    projects = ProjectSerializer(many=True)
    status_distribution = StatusDistributionSerializer(many=True)
    assignee_workload = AssigneeWorkloadSerializer(many=True)
    last_synced_at = serializers.DateTimeField(allow_null=True)
