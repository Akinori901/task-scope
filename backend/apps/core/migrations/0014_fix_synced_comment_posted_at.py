"""同期コメントの posted_at を backlog_created で埋める"""

from django.db import migrations, models


def fix_posted_at(apps, schema_editor):
    Comment = apps.get_model("core", "Comment")
    updated = Comment.objects.filter(source="synced", posted_at__isnull=True).update(
        posted_at=models.F("backlog_created")
    )
    if updated:
        print(f"  Fixed posted_at for {updated} synced comments")


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0013_add_pinned_ticket"),
    ]

    operations = [
        migrations.RunPython(fix_posted_at, migrations.RunPython.noop),
    ]
