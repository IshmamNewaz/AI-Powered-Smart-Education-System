from django.db import models


class SmartUser(models.Model):
	STUDENT = 1
	TEACHER = 2
	MANAGEMENT = 3

	USER_TYPE_CHOICES = (
		(STUDENT, "Student"),
		(TEACHER, "Teacher"),
		(MANAGEMENT, "Management"),
	)

	name = models.CharField(max_length=120, unique=True)
	password = models.CharField(max_length=128)
	user_type = models.PositiveSmallIntegerField(choices=USER_TYPE_CHOICES)

	def __str__(self):
		return f"{self.id} - {self.name}"


class AIChatThread(models.Model):
	owner = models.ForeignKey(SmartUser, on_delete=models.CASCADE, related_name="ai_threads")
	title = models.CharField(max_length=150, default="New Chat")
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["-updated_at", "-id"]

	def __str__(self):
		return f"Thread {self.id} - {self.title}"


class AIChatMessage(models.Model):
	ROLE_CHOICES = (("user", "User"), ("assistant", "Assistant"))

	thread = models.ForeignKey(AIChatThread, on_delete=models.CASCADE, related_name="messages")
	role = models.CharField(max_length=20, choices=ROLE_CHOICES)
	content = models.TextField()
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["id"]

	def __str__(self):
		return f"{self.thread_id} - {self.role}"
