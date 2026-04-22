from django.contrib import admin

from .models import AIChatMessage, AIChatThread, SmartUser


@admin.register(SmartUser)
class SmartUserAdmin(admin.ModelAdmin):
	list_display = ("id", "name", "user_type")
	search_fields = ("name",)


@admin.register(AIChatThread)
class AIChatThreadAdmin(admin.ModelAdmin):
	list_display = ("id", "title", "owner", "updated_at")
	search_fields = ("title", "owner__name")


@admin.register(AIChatMessage)
class AIChatMessageAdmin(admin.ModelAdmin):
	list_display = ("id", "thread", "role", "created_at")
	search_fields = ("content",)

# Register your models here.
