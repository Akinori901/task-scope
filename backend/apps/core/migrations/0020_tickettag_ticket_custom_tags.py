from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0019_backlogspace_sync_interval_minutes_ticket_is_watched"),
    ]

    operations = [
        migrations.CreateModel(
            name="TicketTag",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=50, unique=True)),
                ("color", models.CharField(default="default", max_length=20)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "db_table": "ticket_tags",
                "ordering": ["sort_order", "name"],
            },
        ),
        migrations.AddField(
            model_name="ticket",
            name="custom_tags",
            field=models.JSONField(blank=True, default=list, help_text="次工程タグ名リスト"),
        ),
    ]
