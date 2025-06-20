# Generated by Django 4.2.21 on 2025-05-23 05:30

from django.db import migrations, models
import files.models


class Migration(migrations.Migration):

    dependencies = [
        ('files', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='file',
            name='content_hash',
            field=models.CharField(db_index=True, default=files.models.generate_default_hash, max_length=64, null=True),
        ),
        migrations.AddConstraint(
            model_name='file',
            constraint=models.UniqueConstraint(condition=models.Q(('content_hash__isnull', False)), fields=('content_hash', 'original_filename'), name='unique_content_filename'),
        ),
    ]
