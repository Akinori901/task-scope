import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0017_add_categories_milestones"),
    ]

    operations = [
        migrations.AddField(
            model_name="ticket",
            name="parent_ticket",
            field=models.ForeignKey(
                blank=True,
                help_text="親チケット",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="child_tickets",
                to="core.ticket",
            ),
        ),
    ]
