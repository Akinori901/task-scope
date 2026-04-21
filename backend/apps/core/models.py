from django.db import models


class ExcludedStatus(models.Model):
    """集計から除外するステータス名（プロジェクト単位）"""

    project = models.ForeignKey(
        "Project", on_delete=models.CASCADE, related_name="excluded_statuses"
    )
    status_name = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "excluded_statuses"
        ordering = ["status_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "status_name"], name="uq_project_excluded_status"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.project.project_key}: {self.status_name}"

    @classmethod
    def get_excluded_names(cls, project_ids: list[int] | None = None) -> set[str]:
        """除外ステータス名のセットを返す。project_ids 指定時はそのプロジェクトの設定のみ"""
        qs = cls.objects.all()
        if project_ids is not None:
            qs = qs.filter(project_id__in=project_ids)
        return set(qs.values_list("status_name", flat=True))


class BacklogSpace(models.Model):
    """Backlog スペースの接続情報"""

    space_key = models.CharField(max_length=100, unique=True)
    domain = models.CharField(
        max_length=20,
        default="backlog.jp",
        choices=[("backlog.jp", "backlog.jp"), ("backlog.com", "backlog.com")],
    )
    api_key = models.CharField(max_length=255)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    sync_interval_minutes = models.PositiveIntegerField(
        default=0, help_text="自動同期間隔（分）。0=手動のみ"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "backlog_spaces"

    def __str__(self) -> str:
        return f"{self.space_key}.{self.domain}"

    @property
    def base_url(self) -> str:
        return f"https://{self.space_key}.{self.domain}/api/v2"


class JiraSpace(models.Model):
    """Jira サイトの接続情報"""

    site_name = models.CharField(max_length=200, unique=True, help_text="Jira サイト名（例: mycompany）")
    base_url = models.URLField(max_length=500, help_text="Jira サイトの URL（例: https://mycompany.atlassian.net）")
    user_email = models.EmailField(help_text="Jira ログイン用メールアドレス")
    api_token = models.CharField(max_length=500, help_text="Jira API トークン")
    last_synced_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "jira_spaces"

    def __str__(self) -> str:
        return self.site_name


class BacklogUser(models.Model):
    """Backlog / Jira ユーザー"""

    backlog_id = models.PositiveBigIntegerField()
    space = models.ForeignKey(BacklogSpace, null=True, blank=True, on_delete=models.CASCADE, related_name="users")
    jira_space = models.ForeignKey(JiraSpace, null=True, blank=True, on_delete=models.CASCADE, related_name="users")
    user_id_str = models.CharField(max_length=100)
    name = models.CharField(max_length=200)
    mail_address = models.EmailField(blank=True, default="")
    is_myself = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "backlog_users"
        constraints = [
            models.UniqueConstraint(fields=["space", "backlog_id"], name="uq_space_backlog_user"),
        ]

    def __str__(self) -> str:
        return self.name


class Project(models.Model):
    """Backlog / Jira プロジェクト"""

    backlog_id = models.PositiveBigIntegerField()
    space = models.ForeignKey(BacklogSpace, null=True, blank=True, on_delete=models.CASCADE, related_name="projects")
    jira_space = models.ForeignKey(JiraSpace, null=True, blank=True, on_delete=models.CASCADE, related_name="projects")
    project_key = models.CharField(max_length=100, db_index=True)
    name = models.CharField(max_length=300)
    is_active = models.BooleanField(default=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "projects"
        constraints = [
            models.UniqueConstraint(fields=["space", "backlog_id"], name="uq_space_project"),
        ]

    def __str__(self) -> str:
        return f"{self.project_key} - {self.name}"


class Ticket(models.Model):
    """Backlog チケット（課題）"""

    backlog_id = models.PositiveBigIntegerField()
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="tickets")
    issue_key = models.CharField(max_length=50, db_index=True)
    summary = models.CharField(max_length=500)
    description = models.TextField(blank=True, default="")
    issue_type = models.CharField(max_length=100, blank=True, default="")
    status_name = models.CharField(max_length=100, db_index=True)
    status_id = models.PositiveIntegerField(default=0)
    priority_name = models.CharField(max_length=50, blank=True, default="")
    priority_id = models.PositiveIntegerField(default=0)
    assignee = models.ForeignKey(
        BacklogUser,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_tickets",
    )
    created_user = models.ForeignKey(
        BacklogUser,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_tickets",
    )
    start_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    estimated_hours = models.FloatField(null=True, blank=True)
    actual_hours = models.FloatField(null=True, blank=True)
    comment_count = models.PositiveIntegerField(default=0)
    last_comment_at = models.DateTimeField(null=True, blank=True)
    backlog_created = models.DateTimeField()
    backlog_updated = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # カスタム属性（Backlog のカスタムフィールドを JSON で保存）
    custom_fields = models.JSONField(default=list, blank=True)

    # カテゴリ・マイルストーン（custom_fields から抽出、フィルタ用）
    categories = models.JSONField(default=list, blank=True, help_text="カテゴリ名リスト")
    milestone_names = models.JSONField(default=list, blank=True, help_text="マイルストーン名リスト")

    # ステータス変更追跡
    previous_status_name = models.CharField(max_length=100, blank=True, null=True)
    status_changed_at = models.DateTimeField(null=True, blank=True)

    # 遅延・停滞判定（同期時に算出）
    is_overdue = models.BooleanField(default=False, db_index=True)
    is_stagnant = models.BooleanField(default=False, db_index=True)
    is_watched = models.BooleanField(default=False, db_index=True)
    stagnant_days = models.PositiveIntegerField(default=0)

    # 次工程タグ（ユーザー定義）
    custom_tags = models.JSONField(default=list, blank=True, help_text="次工程タグ名リスト")

    # 親子関係
    parent_ticket = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="child_tickets",
        help_text="親チケット",
    )

    class Meta:
        db_table = "tickets"
        constraints = [
            models.UniqueConstraint(fields=["project", "backlog_id"], name="uq_project_ticket"),
        ]
        indexes = [
            models.Index(fields=["due_date"]),
            models.Index(fields=["assignee", "status_name"]),
        ]

    def __str__(self) -> str:
        return f"{self.issue_key}: {self.summary}"


class Comment(models.Model):
    """チケットのコメント"""

    backlog_id = models.PositiveBigIntegerField()
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="comments")
    content = models.TextField(blank=True, default="")
    created_user = models.ForeignKey(
        BacklogUser,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="posted_comments",
    )
    has_attachments = models.BooleanField(default=False)
    tags = models.JSONField(default=list, blank=True, help_text="タグ配列 (例: ['spec', 'pr'])")
    source = models.CharField(
        max_length=20,
        default="synced",
        choices=[("synced", "同期"), ("ai", "AI生成"), ("manual", "手動作成")],
    )
    posted_at = models.DateTimeField(null=True, blank=True, help_text="Backlog 投稿日時 (null=未投稿)")
    backlog_created = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    mentioned_users = models.ManyToManyField(BacklogUser, blank=True, related_name="mentioned_in_comments")

    class Meta:
        db_table = "comments"
        constraints = [
            models.UniqueConstraint(fields=["ticket", "backlog_id"], name="uq_ticket_comment"),
        ]

    def __str__(self) -> str:
        return f"Comment {self.backlog_id} on {self.ticket.issue_key}"


class CodeRepository(models.Model):
    """コードリポジトリ（ローカルディレクトリ）とプロジェクトの紐付け"""

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="repositories")
    name = models.CharField(max_length=200)
    local_path = models.CharField(max_length=500, help_text="ローカルディレクトリの絶対パス")
    match_field = models.CharField(
        max_length=200, blank=True, null=True,
        help_text="マッチ対象のカスタム属性名（例: 対象システム）。空なら無条件マッチ",
    )
    match_value = models.CharField(
        max_length=200, blank=True, null=True,
        help_text="マッチする値（例: フロントエンド）",
    )
    description = models.CharField(max_length=500, blank=True, default="", help_text="技術スタック等のメモ")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "code_repositories"
        ordering = ["project", "name"]

    def __str__(self) -> str:
        return f"{self.project.project_key}: {self.name}"


class Milestone(models.Model):
    """マイルストーン（プロジェクト単位、期間はローカル管理）"""

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="milestones")
    name = models.CharField(max_length=200)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "milestones"
        ordering = ["sort_order", "start_date"]
        constraints = [
            models.UniqueConstraint(fields=["project", "name"], name="uq_project_milestone"),
        ]

    def __str__(self) -> str:
        return f"{self.project.project_key}: {self.name}"


class PinnedTicket(models.Model):
    """ピン留めされたチケット"""

    ticket = models.OneToOneField(Ticket, on_delete=models.CASCADE, related_name="pin")
    note = models.CharField(max_length=200, blank=True, default="")
    pinned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "pinned_tickets"
        ordering = ["-pinned_at"]

    def __str__(self) -> str:
        return f"Pin: {self.ticket.issue_key}"


class TicketEvaluation(models.Model):
    """AI によるチケット品質評価"""

    class ResolutionType(models.TextChoices):
        DATA_FIX = "data_fix", "データ修正"
        CODE_FIX = "code_fix", "コード修正"
        CONFIG_CHANGE = "config_change", "設定変更"
        INVESTIGATION = "investigation", "調査のみ"
        MIXED = "mixed", "複合"
        UNKNOWN = "unknown", "判定不可"

    class SpecReadiness(models.TextChoices):
        READY = "ready", "作成可能"
        PARTIAL = "partial", "一部不足"
        NOT_READY = "not_ready", "情報不足"

    class ScheduleFeasibility(models.TextChoices):
        FEASIBLE = "feasible", "妥当"
        RISKY = "risky", "リスクあり"
        UNREALISTIC = "unrealistic", "非現実的"
        UNKNOWN = "unknown", "判定不可"

    ticket = models.OneToOneField(Ticket, on_delete=models.CASCADE, related_name="evaluation")
    info_completeness_score = models.PositiveIntegerField(help_text="情報充足度 0-100")
    missing_items = models.JSONField(default=list, help_text="欠損情報リスト")
    spec_readiness = models.CharField(
        max_length=20,
        choices=SpecReadiness.choices,
        help_text="方針書作成可否",
    )
    schedule_feasibility = models.CharField(
        max_length=20,
        choices=ScheduleFeasibility.choices,
        help_text="日程妥当性",
    )
    schedule_comment = models.TextField(blank=True, default="", help_text="日程に関するコメント")
    summary = models.TextField(help_text="評価サマリ")
    pr_urls = models.JSONField(default=list, help_text="検出されたPR URL一覧")

    # 難易度評価スコア（各 0-100）
    impact_scope_score = models.PositiveIntegerField(default=0, help_text="影響範囲 0-100")
    query_complexity_score = models.PositiveIntegerField(default=0, help_text="クエリ複雑度 0-100")
    ambiguity_score = models.PositiveIntegerField(default=0, help_text="仕様曖昧度 0-100")
    verification_difficulty_score = models.PositiveIntegerField(default=0, help_text="テスト・検証難度 0-100")
    coordination_cost_score = models.PositiveIntegerField(default=0, help_text="調整コスト 0-100")
    regression_risk_score = models.PositiveIntegerField(default=0, help_text="リグレッションリスク 0-100")
    overall_difficulty_score = models.PositiveIntegerField(default=0, help_text="総合難易度 0-100")
    difficulty_comment = models.TextField(blank=True, default="", help_text="難易度に関する補足コメント")

    # 対処区分
    resolution_type = models.CharField(
        max_length=20,
        choices=ResolutionType.choices,
        default="unknown",
        help_text="対処区分",
    )
    resolution_comment = models.TextField(blank=True, default="", help_text="対処区分の根拠")

    # 推定工数
    estimated_days = models.FloatField(default=0, help_text="推定工数（人日）")
    estimated_breakdown = models.JSONField(default=list, help_text="工数内訳 [{phase, days, note}]")

    comment_count_at_eval = models.PositiveIntegerField(default=0, help_text="評価時のコメント数")

    model_used = models.CharField(max_length=50)
    evaluated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ticket_evaluations"

    def __str__(self) -> str:
        return f"Evaluation for {self.ticket.issue_key}"


class TicketTag(models.Model):
    """ユーザー定義の次工程タグ"""

    name = models.CharField(max_length=50, unique=True)
    color = models.CharField(max_length=20, default="default")
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ticket_tags"
        ordering = ["sort_order", "name"]

    def __str__(self) -> str:
        return self.name
