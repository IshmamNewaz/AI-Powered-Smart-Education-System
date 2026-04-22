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


class RegistrationProfile(models.Model):
	ROLE_CHOICES = SmartUser.USER_TYPE_CHOICES

	smart_user = models.OneToOneField(SmartUser, on_delete=models.CASCADE, related_name="registration_profile")
	role = models.PositiveSmallIntegerField(choices=ROLE_CHOICES)
	profile_photo = models.FileField(upload_to="profile_photos/", blank=True, null=True)
	profile_data = models.JSONField(default=dict)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	def __str__(self):
		return f"RegistrationProfile<{self.smart_user_id}>"


class CourseAssignment(models.Model):
	TARGET_ROLE_CHOICES = SmartUser.USER_TYPE_CHOICES

	created_by = models.ForeignKey(SmartUser, on_delete=models.CASCADE, related_name="created_course_assignments")
	target_user = models.ForeignKey(SmartUser, on_delete=models.CASCADE, related_name="course_assignments")
	teacher_user = models.ForeignKey(SmartUser, on_delete=models.SET_NULL, related_name="teacher_domain_assignments", null=True, blank=True)
	target_role = models.PositiveSmallIntegerField(choices=TARGET_ROLE_CHOICES)
	course_name = models.CharField(max_length=140)
	class_name = models.CharField(max_length=120, blank=True)
	notes = models.TextField(blank=True)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["-created_at", "-id"]

	def __str__(self):
		return f"CourseAssignment<{self.id}> {self.course_name}"


class WeeklyClassSchedule(models.Model):
	DAY_CHOICES = (
		("monday", "Monday"),
		("tuesday", "Tuesday"),
		("wednesday", "Wednesday"),
		("thursday", "Thursday"),
		("friday", "Friday"),
		("saturday", "Saturday"),
		("sunday", "Sunday"),
	)

	assignment = models.ForeignKey(CourseAssignment, on_delete=models.CASCADE, related_name="weekly_slots")
	day_of_week = models.CharField(max_length=12, choices=DAY_CHOICES)
	start_time = models.TimeField()
	end_time = models.TimeField()
	room = models.CharField(max_length=120, blank=True)

	class Meta:
		ordering = ["day_of_week", "start_time", "id"]

	def __str__(self):
		return f"{self.assignment.course_name} - {self.day_of_week}"


class StudentSubjectMark(models.Model):
	teacher = models.ForeignKey(SmartUser, on_delete=models.CASCADE, related_name="entered_marks")
	student = models.ForeignKey(SmartUser, on_delete=models.CASCADE, related_name="subject_marks")
	class_name = models.CharField(max_length=120)
	subject = models.CharField(max_length=120)
	ct_1 = models.IntegerField(default=0)
	ct_2 = models.IntegerField(default=0)
	ct_3 = models.IntegerField(default=0)
	ct_4 = models.IntegerField(default=0)
	ct_5 = models.IntegerField(default=0)
	ct_6 = models.IntegerField(default=0)
	ct_7 = models.IntegerField(default=0)
	ct_8 = models.IntegerField(default=0)
	term_1 = models.IntegerField(default=0)
	term_2 = models.IntegerField(default=0)
	model_1 = models.IntegerField(default=0)
	model_2 = models.IntegerField(default=0)
	model_3 = models.IntegerField(default=0)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		unique_together = ("teacher", "student", "subject")
		ordering = ["subject", "id"]

	def __str__(self):
		return f"Mark<{self.student_id}:{self.subject}>"


class LibraryApplication(models.Model):
	requester = models.ForeignKey(SmartUser, on_delete=models.CASCADE, related_name="library_applications")
	requester_role = models.PositiveSmallIntegerField(choices=SmartUser.USER_TYPE_CHOICES)
	resource_type = models.CharField(max_length=80)
	explanation = models.TextField()
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["-created_at", "-id"]

	def __str__(self):
		return f"LibraryApplication<{self.id}> by {self.requester_id}"
