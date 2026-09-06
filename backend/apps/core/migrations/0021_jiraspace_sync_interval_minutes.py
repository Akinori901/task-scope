from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0020_tickettag_ticket_custom_tags'),
    ]

    operations = [
        migrations.AddField(
            model_name='jiraspace',
            name='sync_interval_minutes',
            field=models.PositiveIntegerField(default=0, help_text='自動同期間隔（分）。0=手動のみ'),
        ),
    ]
