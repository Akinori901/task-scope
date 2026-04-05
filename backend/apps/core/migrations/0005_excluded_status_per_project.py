# Rebuild ExcludedStatus with project FK

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0004_add_excluded_status'),
    ]

    operations = [
        migrations.DeleteModel(
            name='ExcludedStatus',
        ),
        migrations.CreateModel(
            name='ExcludedStatus',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status_name', models.CharField(max_length=100)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('project', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='excluded_statuses',
                    to='core.project',
                )),
            ],
            options={
                'db_table': 'excluded_statuses',
                'ordering': ['status_name'],
            },
        ),
        migrations.AddConstraint(
            model_name='excludedstatus',
            constraint=models.UniqueConstraint(
                fields=('project', 'status_name'),
                name='uq_project_excluded_status',
            ),
        ),
    ]
