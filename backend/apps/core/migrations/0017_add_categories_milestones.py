# Generated manually

import django.db.models.deletion
from django.db import migrations, models


def populate_categories_milestones(apps, schema_editor):
    """既存チケットの custom_fields からカテゴリ・マイルストーンを抽出"""
    Ticket = apps.get_model("core", "Ticket")
    Milestone = apps.get_model("core", "Milestone")

    seen_milestones: set[tuple[int, str]] = set()

    for ticket in Ticket.objects.all().iterator(chunk_size=500):
        categories = []
        milestone_names = []
        for cf in ticket.custom_fields or []:
            if cf.get("id") == "__category__":
                val = cf.get("value", [])
                categories = val if isinstance(val, list) else [val]
            elif cf.get("id") == "__milestone__":
                val = cf.get("value", [])
                milestone_names = val if isinstance(val, list) else [val]

        ticket.categories = categories
        ticket.milestone_names = milestone_names
        ticket.save(update_fields=["categories", "milestone_names"])

        # Milestone レコードを収集
        for name in milestone_names:
            key = (ticket.project_id, name)
            if key not in seen_milestones:
                seen_milestones.add(key)

    # Milestone レコードを一括作成
    milestones_to_create = [
        Milestone(project_id=project_id, name=name)
        for project_id, name in seen_milestones
    ]
    Milestone.objects.bulk_create(milestones_to_create, ignore_conflicts=True)


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0016_add_jira_space_fk"),
    ]

    operations = [
        # Ticket に categories / milestone_names フィールド追加
        migrations.AddField(
            model_name="ticket",
            name="categories",
            field=models.JSONField(blank=True, default=list, help_text="カテゴリ名リスト"),
        ),
        migrations.AddField(
            model_name="ticket",
            name="milestone_names",
            field=models.JSONField(blank=True, default=list, help_text="マイルストーン名リスト"),
        ),
        # Milestone モデル作成
        migrations.CreateModel(
            name="Milestone",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=200)),
                ("start_date", models.DateField(blank=True, null=True)),
                ("end_date", models.DateField(blank=True, null=True)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("project", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="milestones", to="core.project")),
            ],
            options={
                "db_table": "milestones",
                "ordering": ["sort_order", "start_date"],
            },
        ),
        migrations.AddConstraint(
            model_name="milestone",
            constraint=models.UniqueConstraint(fields=("project", "name"), name="uq_project_milestone"),
        ),
        # データ移行
        migrations.RunPython(populate_categories_milestones, migrations.RunPython.noop),
    ]
