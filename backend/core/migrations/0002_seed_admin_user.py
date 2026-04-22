from django.db import migrations


def seed_admin_user(apps, schema_editor):
    SmartUser = apps.get_model("core", "SmartUser")
    SmartUser.objects.get_or_create(
        name="admin",
        defaults={"password": "12345678", "user_type": 3},
    )


def remove_admin_user(apps, schema_editor):
    SmartUser = apps.get_model("core", "SmartUser")
    SmartUser.objects.filter(name="admin").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_admin_user, reverse_code=remove_admin_user),
    ]
