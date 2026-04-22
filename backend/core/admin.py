from django.contrib import admin

from .models import AIChatMessage, AIChatThread, LibraryApplication, RegistrationProfile, SmartUser


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


@admin.register(RegistrationProfile)
class RegistrationProfileAdmin(admin.ModelAdmin):
	list_display = ("id", "smart_user", "role", "created_at")
	search_fields = ("smart_user__name",)


@admin.register(LibraryApplication)
class LibraryApplicationAdmin(admin.ModelAdmin):
	list_display = ("id", "requester", "requester_role", "resource_type", "created_at")
	search_fields = ("requester__name", "resource_type")

# Register your models here.
