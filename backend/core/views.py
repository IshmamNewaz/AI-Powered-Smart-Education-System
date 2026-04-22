import json
import pickle
from pathlib import Path
from functools import lru_cache
import csv
from urllib import error, request
import pandas as pd
from django.db import transaction

from django.http import JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .models import AIChatMessage, AIChatThread, CourseAssignment, LibraryApplication, RegistrationProfile, SmartUser, StudentSubjectMark, WeeklyClassSchedule

OLLAMA_MODEL = "hf.co/unsloth/Llama-3.2-1B-Instruct-GGUF:UD-Q4_K_XL"
OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = PROJECT_ROOT / "MLModel" / "best_pass_fail_model.pkl"
DATASET_PATH = PROJECT_ROOT / "MLModel" / "student_dataset_500_rows.csv"
ALLOWED_SUBJECTS = {"Physics", "Chemistry", "Biology", "Math"}


def _normalize_subject_name(value):
	text = str(value or "").strip()
	if text.lower() in ["mathematics", "math"]:
		return "Math"
	if text.lower() == "physics":
		return "Physics"
	if text.lower() == "chemistry":
		return "Chemistry"
	if text.lower() == "biology":
		return "Biology"
	return text


def _menu_payload(user=None):
	top_items = []
	left_items = ["Academics", "Library", "Others", "AI Help", "Notifications"]

	if not user:
		return {
			"top": {
				"title": "ASEMS",
				"items": top_items,
				"profile_dropdown": ["Profile", "Settings", "Logout"],
			},
			"left": left_items,
		}

	if user.user_type == SmartUser.MANAGEMENT:
		top_items.extend(["Courses and Result", "Registration", "Grade Report"])
		left_items.extend(["Grade Reports", "Registration", "Assign Courses"])
	if user.user_type == SmartUser.STUDENT:
		top_items.extend(["Courses and Result", "Grade Report"])
		left_items.extend(["Grade Reports", "Weekly Schedule"])
	if user.user_type == SmartUser.TEACHER:
		left_items.extend(["Weekly Schedule", "Marks Entry"])

	return {
		"top": {
			"title": "ASEMS",
			"items": top_items,
			"profile_dropdown": ["Profile", "Settings", "Logout"],
		},
		"left": left_items,
	}


def _serialize_user(user):
	return {
		"user_id": user.id,
		"name": user.name,
		"user_type": user.user_type,
	}


def _get_session_user(request):
	user_id = request.session.get("smart_user_id")
	if not user_id:
		return None
	try:
		return SmartUser.objects.get(id=user_id)
	except SmartUser.DoesNotExist:
		return None


def _require_user(request):
	user = _get_session_user(request)
	if not user:
		return None, JsonResponse({"error": "Unauthorized."}, status=401)
	return user, None


def _require_management(user):
	if user.user_type != SmartUser.MANAGEMENT:
		return JsonResponse({"error": "Only management can access this endpoint."}, status=403)
	return None


def _require_student(user):
	if user.user_type != SmartUser.STUDENT:
		return JsonResponse({"error": "Only students can access this endpoint."}, status=403)
	return None


def _require_student_or_management(user):
	if user.user_type not in [SmartUser.STUDENT, SmartUser.MANAGEMENT]:
		return JsonResponse({"error": "Only students or management can access this endpoint."}, status=403)
	return None


def _require_teacher(user):
	if user.user_type != SmartUser.TEACHER:
		return JsonResponse({"error": "Only teachers can access this endpoint."}, status=403)
	return None


def _require_student_or_teacher(user):
	if user.user_type not in [SmartUser.STUDENT, SmartUser.TEACHER]:
		return JsonResponse({"error": "Only students or teachers can access this endpoint."}, status=403)
	return None


def _user_type_label(user_type):
	lookup = {
		SmartUser.STUDENT: "Student",
		SmartUser.TEACHER: "Teacher",
		SmartUser.MANAGEMENT: "Management",
	}
	return lookup.get(user_type, "Unknown")


def _serialize_schedule_item(assignment):
	return {
		"assignment_id": assignment.id,
		"course_name": assignment.course_name,
		"class_name": assignment.class_name,
		"target_user_id": assignment.target_user.id,
		"target_user_name": assignment.target_user.name,
		"target_role": assignment.target_role,
		"teacher_user_id": assignment.teacher_user.id if assignment.teacher_user else None,
		"teacher_user_name": assignment.teacher_user.name if assignment.teacher_user else "",
		"notes": assignment.notes,
		"weekly_slots": [
			{
				"day": slot.day_of_week,
				"start_time": slot.start_time.strftime("%H:%M"),
				"end_time": slot.end_time.strftime("%H:%M"),
				"room": slot.room,
			}
			for slot in assignment.weekly_slots.all()
		],
	}


def _serialize_thread(thread):
	return {
		"id": thread.id,
		"title": thread.title,
		"created_at": thread.created_at.isoformat(),
		"updated_at": thread.updated_at.isoformat(),
	}


def _serialize_message(message):
	return {
		"id": message.id,
		"role": message.role,
		"content": message.content,
		"created_at": message.created_at.isoformat(),
	}


def _system_prompt_for_user(user):
	if user.user_type == SmartUser.STUDENT:
		return (
			"You are an AI tutor for students. Explain clearly, use simple examples, "
			"and include short practice tasks when relevant."
		)
	if user.user_type == SmartUser.TEACHER:
		return (
			"You are an AI assistant for teachers. Focus on lesson planning, assessment design, "
			"and concise classroom-ready outputs."
		)
	return (
		"You are an AI assistant for education management. Focus on actionable summaries, "
		"policy clarity, and operational recommendations."
	)


def _build_ollama_messages(thread, user):
	messages = [{"role": "system", "content": _system_prompt_for_user(user)}]
	for message in thread.messages.all():
		messages.append({"role": message.role, "content": message.content})
	return messages


def _title_from_prompt(prompt):
	trimmed = " ".join(prompt.split())
	if not trimmed:
		return "New Chat"
	return trimmed[:60]


def _ask_ollama(messages):
	payload = {
		"model": OLLAMA_MODEL,
		"messages": messages,
		"stream": False,
	}
	data = json.dumps(payload).encode("utf-8")
	req = request.Request(
		OLLAMA_CHAT_URL,
		data=data,
		headers={"Content-Type": "application/json"},
		method="POST",
	)
	try:
		with request.urlopen(req, timeout=180) as response:
			body = response.read().decode("utf-8")
			parsed = json.loads(body)
			return parsed.get("message", {}).get("content", "").strip()
	except error.HTTPError as exc:
		raise RuntimeError(f"Ollama HTTP error: {exc.code}") from exc
	except error.URLError as exc:
		raise RuntimeError("Could not connect to Ollama. Ensure it is running.") from exc
	except json.JSONDecodeError as exc:
		raise RuntimeError("Invalid response from Ollama.") from exc


def _stream_ollama_text(messages):
	payload = {
		"model": OLLAMA_MODEL,
		"messages": messages,
		"stream": True,
	}
	data = json.dumps(payload).encode("utf-8")
	req = request.Request(
		OLLAMA_CHAT_URL,
		data=data,
		headers={"Content-Type": "application/json"},
		method="POST",
	)
	try:
		with request.urlopen(req, timeout=180) as response:
			for raw_line in response:
				line = raw_line.decode("utf-8").strip()
				if not line:
					continue
				parsed = json.loads(line)
				chunk = parsed.get("message", {}).get("content", "")
				if chunk:
					yield chunk
	except error.HTTPError as exc:
		raise RuntimeError(f"Ollama HTTP error: {exc.code}") from exc
	except error.URLError as exc:
		raise RuntimeError("Could not connect to Ollama. Ensure it is running.") from exc
	except json.JSONDecodeError as exc:
		raise RuntimeError("Invalid streaming response from Ollama.") from exc


def _to_int(value, fallback=0):
	try:
		return int(float(value))
	except (TypeError, ValueError):
		return fallback


@lru_cache(maxsize=1)
def _load_dataset_rows():
	rows = []
	with open(DATASET_PATH, newline="", encoding="utf-8") as handle:
		reader = csv.DictReader(handle)
		for row in reader:
			normalized_subject = _normalize_subject_name(row.get("subject"))
			if normalized_subject not in ALLOWED_SUBJECTS:
				continue
			row["subject"] = normalized_subject
			rows.append(row)
	return rows


@lru_cache(maxsize=1)
def _load_prediction_model():
	with open(MODEL_PATH, "rb") as handle:
		return pickle.load(handle)


def _student_rows(student_id):
	rows = [row for row in _load_dataset_rows() if str(row.get("student_id")) == str(student_id)]
	return rows


def _normalize_dataset_student_id(value):
	try:
		student_num = int(str(value).strip())
	except (TypeError, ValueError):
		return "1000"
	if student_num < 1000:
		student_num += 1000
	return str(student_num)


def _student_dataset_id_from_user(user):
	profile = getattr(user, "registration_profile", None)
	roll = ""
	if profile and profile.profile_data:
		roll = str(profile.profile_data.get("roll_number", "")).strip()
	if roll:
		return _normalize_dataset_student_id(roll)
	return _normalize_dataset_student_id(user.id)


def _rows_from_teacher_marks(student_user):
	mark_rows = StudentSubjectMark.objects.filter(student=student_user)
	if not mark_rows.exists():
		return []

	dataset_id = _student_dataset_id_from_user(student_user)
	rows = []
	for mark in mark_rows:
		normalized_subject = _normalize_subject_name(mark.subject)
		if normalized_subject not in ALLOWED_SUBJECTS:
			continue
		rows.append(
			{
				"student_id": dataset_id,
				"subject": normalized_subject,
				"ct_1": mark.ct_1,
				"ct_2": mark.ct_2,
				"ct_3": mark.ct_3,
				"ct_4": mark.ct_4,
				"ct_5": mark.ct_5,
				"ct_6": mark.ct_6,
				"ct_7": mark.ct_7,
				"ct_8": mark.ct_8,
				"term_1": mark.term_1,
				"term_2": mark.term_2,
				"model_1": mark.model_1,
				"model_2": mark.model_2,
				"model_3": mark.model_3,
			}
		)
	return rows


def _management_validate_student(student_id, class_name):
	if not student_id:
		return None, JsonResponse({"error": "student_id is required for management search."}, status=400)
	if not class_name:
		return None, JsonResponse({"error": "class_name is required for management search."}, status=400)

	try:
		target_user = SmartUser.objects.get(id=student_id, user_type=SmartUser.STUDENT)
	except SmartUser.DoesNotExist:
		return None, JsonResponse({"error": "Student not found for provided ID."}, status=404)

	profile = getattr(target_user, "registration_profile", None)
	student_class = str((profile.profile_data or {}).get("class_semester_year", "")).strip() if profile else ""
	if student_class != class_name:
		return None, JsonResponse({"error": "Provided class_name does not match this student."}, status=400)

	return target_user, None


def _resolve_student_rows_for_user(student_user, requested_student_id=""):
	teacher_rows = _rows_from_teacher_marks(student_user)
	if teacher_rows:
		return teacher_rows

	dataset_student_id = _normalize_dataset_student_id(requested_student_id or _student_dataset_id_from_user(student_user))
	return _student_rows(dataset_student_id)


def _build_semester_subject_row(row, semester):
	if semester == 1:
		ct_keys = ["ct_1", "ct_2", "ct_3", "ct_4"]
		term_key = "term_1"
		model_key = "model_1"
	elif semester == 2:
		ct_keys = ["ct_5", "ct_6", "ct_7", "ct_8"]
		term_key = "term_2"
		model_key = "model_2"
	else:
		ct_keys = ["ct_9", "ct_10", "ct_11", "ct_12"]
		term_key = "term_3"
		model_key = "model_4"

	ct_scores = [_to_int(row.get(key)) for key in ct_keys]
	ct_avg = round(sum(ct_scores) / max(len(ct_scores), 1), 2)
	term = _to_int(row.get(term_key))
	model_score = _to_int(row.get(model_key))
	total = round((ct_avg * 0.3) + (term * 0.4) + (model_score * 0.3), 2)

	return {
		"subject": row.get("subject", "Unknown"),
		"ct_scores": ct_scores,
		"ct_average": ct_avg,
		"term": term,
		"model": model_score,
		"total": total,
	}


def _semester_report_payload(rows):
	semester_blocks = []
	for semester in [1, 2]:
		subjects = [_build_semester_subject_row(row, semester) for row in rows]
		avg_total = round(sum(subject["total"] for subject in subjects) / max(len(subjects), 1), 2)
		semester_blocks.append(
			{
				"semester": semester,
				"status": "completed",
				"subjects": subjects,
				"average_total": avg_total,
			}
		)

	return {
		"type": "semester",
		"subject_list": [row.get("subject", "Unknown") for row in rows],
		"semesters": semester_blocks,
	}


def _build_llm_prediction_analysis(student_id, subject_predictions, overall_prediction):
	lines = []
	for item in subject_predictions:
		probability = item.get("pass_probability")
		prob_text = f" ({round(probability * 100)}%)" if isinstance(probability, float) else ""
		lines.append(f"- {item.get('subject')}: {item.get('prediction')}{prob_text}")

	prompt = (
		"You are an academic performance analyst.\n"
		f"Student ID: {student_id}\n"
		f"Semester 3 overall prediction: {overall_prediction}\n"
		"Subject-level predictions:\n"
		+ "\n".join(lines)
		+ "\nProvide a concise analysis with:\n"
		"1) Key strengths\n2) Key risks\n3) 3 actionable recommendations for semester 3."
	)

	try:
		return _ask_ollama([
			{"role": "system", "content": "You are a concise educational advisor."},
			{"role": "user", "content": prompt},
		])
	except RuntimeError:
		return "LLM analysis is currently unavailable. Please ensure Ollama is running and try again."


def _required_fields_by_role(role_name):
	common = ["full_name", "email_address", "phone_number", "username", "password", "confirm_password"]
	if role_name == "student":
		return common + ["date_of_birth", "gender", "institution_name", "department_program", "class_semester_year", "academic_session"]
	if role_name == "teacher":
		return common + ["employee_id", "date_of_birth", "gender", "institution_name", "department", "designation", "subjects_teaching"]
	if role_name == "management":
		return common + ["employee_staff_id", "date_of_birth", "institution_name", "department", "position", "role_type"]
	return common


def _role_map():
	return {
		"student": SmartUser.STUDENT,
		"teacher": SmartUser.TEACHER,
		"management": SmartUser.MANAGEMENT,
	}


def _role_name_from_type(user_type):
	lookup = {value: key for key, value in _role_map().items()}
	return lookup.get(user_type, "unknown")


def _parse_registration_input(request):
	content_type = request.META.get("CONTENT_TYPE", "")
	if "multipart/form-data" in content_type:
		role = str(request.POST.get("role", "")).strip().lower()
		payload_raw = request.POST.get("payload", "{}")
		try:
			payload = json.loads(payload_raw)
		except json.JSONDecodeError:
			payload = {}
		profile_photo = request.FILES.get("profile_photo")
		return role, payload, profile_photo

	try:
		data = json.loads(request.body.decode("utf-8"))
	except (json.JSONDecodeError, UnicodeDecodeError):
		return "", {}, None

	role = str(data.get("role", "")).strip().lower()
	payload = data.get("payload") or {}
	return role, payload, None


def _serialize_registration_profile(profile, request):
	photo_url = ""
	if profile.profile_photo:
		try:
			photo_url = request.build_absolute_uri(profile.profile_photo.url)
		except Exception:
			photo_url = profile.profile_photo.url

	return {
		"id": profile.id,
		"role": _role_name_from_type(profile.role),
		"user_id": profile.smart_user.id,
		"username": profile.smart_user.name,
		"full_name": profile.profile_data.get("full_name", ""),
		"email_address": profile.profile_data.get("email_address", ""),
		"phone_number": profile.profile_data.get("phone_number", ""),
		"profile_photo_url": photo_url,
		"profile_data": profile.profile_data,
		"created_at": profile.created_at.isoformat(),
		"updated_at": profile.updated_at.isoformat(),
	}


def _save_registration(role, payload, created_by_user, profile_photo=None, existing_profile=None):
	role_map = _role_map()
	if role not in role_map:
		return None, "Invalid role."

	missing = [field for field in _required_fields_by_role(role) if not str(payload.get(field, "")).strip()]
	if missing:
		return None, f"Missing required fields: {', '.join(missing)}"

	password = str(payload.get("password", "")).strip()
	confirm_password = str(payload.get("confirm_password", "")).strip()
	if password != confirm_password:
		return None, "Password and confirm password do not match."

	username = str(payload.get("username", "")).strip()
	if existing_profile:
		if existing_profile.smart_user.name != username and SmartUser.objects.filter(name=username).exists():
			return None, "Username already exists."
	else:
		if SmartUser.objects.filter(name=username).exists():
			return None, "Username already exists."

	with transaction.atomic():
		if existing_profile:
			smart_user = existing_profile.smart_user
			smart_user.name = username
			smart_user.user_type = role_map[role]
			if password:
				smart_user.password = password
			smart_user.save()
			profile = existing_profile
			profile.role = role_map[role]
		else:
			smart_user = SmartUser.objects.create(name=username, password=password, user_type=role_map[role])
			profile = RegistrationProfile(smart_user=smart_user, role=role_map[role])

		profile_data = dict(payload)
		profile_data.pop("confirm_password", None)
		profile_data["created_by"] = created_by_user.id
		if role == "student":
			profile_data["roll_number"] = str(payload.get("roll_number") or smart_user.id)
		if role == "teacher":
			profile_data["employee_id"] = str(payload.get("employee_id") or smart_user.id)
		if role == "management":
			profile_data["employee_staff_id"] = str(payload.get("employee_staff_id") or smart_user.id)
			profile_data["access_permissions"] = [
				"Student Management",
				"Teacher Management",
				"Course Management",
				"Analytics Dashboard",
				"AI System Controls",
				"Grade Reports",
				"Registration",
				"Assignments",
			]

		profile.profile_data = profile_data
		if profile_photo:
			profile.profile_photo = profile_photo
		profile.save()

	return profile, None


def _curriculum_report_payload(rows):
	curriculum_rows = []
	for row in rows:
		sem1 = _build_semester_subject_row(row, 1)
		sem2 = _build_semester_subject_row(row, 2)
		trend = round(sem2["total"] - sem1["total"], 2)
		curriculum_rows.append(
			{
				"subject": row.get("subject", "Unknown"),
				"semester_1_total": sem1["total"],
				"semester_2_total": sem2["total"],
				"trend": trend,
			}
		)

	return {
		"type": "curriculum",
		"subject_list": [row.get("subject", "Unknown") for row in rows],
		"curriculum": curriculum_rows,
	}


def _project_for_next_semester(row):
	projected = dict(row)
	projected["ct_9"] = _to_int(round((_to_int(row.get("ct_1")) + _to_int(row.get("ct_5"))) / 2))
	projected["ct_10"] = _to_int(round((_to_int(row.get("ct_2")) + _to_int(row.get("ct_6"))) / 2))
	projected["ct_11"] = _to_int(round((_to_int(row.get("ct_3")) + _to_int(row.get("ct_7"))) / 2))
	projected["ct_12"] = _to_int(round((_to_int(row.get("ct_4")) + _to_int(row.get("ct_8"))) / 2))
	projected["term_3"] = _to_int(round((_to_int(row.get("term_1")) + _to_int(row.get("term_2"))) / 2))
	projected["model_4"] = _to_int(round((_to_int(row.get("model_1")) + _to_int(row.get("model_2")) + _to_int(row.get("model_3"))) / 3))
	return projected


def _row_from_client_sheet(sheet_entry, fallback_row):
	merged = dict(fallback_row)
	for key in fallback_row.keys():
		if key in sheet_entry and key != "final_result":
			merged[key] = sheet_entry[key]
	return merged


def _predict_rows(rows):
	model = _load_prediction_model()
	feature_names = model.feature_names_in_.tolist()
	inputs = []
	for row in rows:
		prepared = {}
		for key in feature_names:
			if key == "subject":
				prepared[key] = str(row.get(key, "Unknown"))
			else:
				prepared[key] = _to_int(row.get(key))
		inputs.append(prepared)

	input_frame = pd.DataFrame(inputs)
	predictions = model.predict(input_frame).tolist()
	probabilities = None
	if hasattr(model, "predict_proba"):
		proba_values = model.predict_proba(input_frame)
		probabilities = [round(float(value[1]), 4) for value in proba_values]

	results = []
	for index, row in enumerate(rows):
		pred = int(predictions[index])
		results.append(
			{
				"subject": row.get("subject", "Unknown"),
				"prediction": "Pass" if pred == 1 else "Fail",
				"prediction_code": pred,
				"pass_probability": probabilities[index] if probabilities else None,
				"input_sheet": {key: row.get(key) for key in feature_names},
			}
		)

	pass_count = len([item for item in results if item["prediction_code"] == 1])
	overall = (
		"Student will likely pass semester 3"
		if pass_count >= max(1, len(results) // 2)
		else "Student is at risk of failing semester 3"
	)
	return overall, results


@csrf_exempt
@require_POST
def login_view(request):
	try:
		data = json.loads(request.body.decode("utf-8"))
	except (json.JSONDecodeError, UnicodeDecodeError):
		return JsonResponse({"error": "Invalid JSON payload."}, status=400)

	name = str(data.get("name", "")).strip()
	password = str(data.get("password", "")).strip()
	if not name or not password:
		return JsonResponse({"error": "Name and password are required."}, status=400)

	try:
		user = SmartUser.objects.get(name=name, password=password)
	except SmartUser.DoesNotExist:
		return JsonResponse({"error": "Invalid credentials."}, status=401)

	request.session["smart_user_id"] = user.id
	return JsonResponse(
		{
			"message": "Login successful.",
			"authenticated": True,
			"user": _serialize_user(user),
			"menus": _menu_payload(user),
		}
	)


@csrf_exempt
@require_POST
def logout_view(request):
	request.session.flush()
	return JsonResponse({"message": "Logged out successfully.", "authenticated": False})


@require_GET
def session_view(request):
	user = _get_session_user(request)
	if not user:
		return JsonResponse({"authenticated": False, "menus": _menu_payload(None)})

	return JsonResponse(
		{
			"authenticated": True,
			"user": _serialize_user(user),
			"menus": _menu_payload(user),
		}
	)


@require_GET
def dashboard_view(request):
	user = _get_session_user(request)
	if not user:
		return JsonResponse({"error": "Unauthorized."}, status=401)

	return JsonResponse(
		{
			"welcome": f"Welcome back, {user.name}.",
			"user": _serialize_user(user),
			"menus": _menu_payload(user),
		}
	)


@require_GET
def ai_threads_view(request):
	user, error_response = _require_user(request)
	if error_response:
		return error_response

	threads = AIChatThread.objects.filter(owner=user)
	return JsonResponse({"threads": [_serialize_thread(thread) for thread in threads]})


@require_GET
def ai_thread_messages_view(request, thread_id):
	user, error_response = _require_user(request)
	if error_response:
		return error_response

	try:
		thread = AIChatThread.objects.get(id=thread_id, owner=user)
	except AIChatThread.DoesNotExist:
		return JsonResponse({"error": "Thread not found."}, status=404)

	messages = thread.messages.all()
	return JsonResponse(
		{
			"thread": _serialize_thread(thread),
			"messages": [_serialize_message(message) for message in messages],
		}
	)


@csrf_exempt
@require_POST
def ai_chat_view(request):
	user, error_response = _require_user(request)
	if error_response:
		return error_response

	try:
		data = json.loads(request.body.decode("utf-8"))
	except (json.JSONDecodeError, UnicodeDecodeError):
		return JsonResponse({"error": "Invalid JSON payload."}, status=400)

	prompt = str(data.get("message", "")).strip()
	thread_id = data.get("thread_id")
	if not prompt:
		return JsonResponse({"error": "Message is required."}, status=400)

	if thread_id:
		try:
			thread = AIChatThread.objects.get(id=thread_id, owner=user)
		except AIChatThread.DoesNotExist:
			return JsonResponse({"error": "Thread not found."}, status=404)
	else:
		thread = AIChatThread.objects.create(owner=user, title=_title_from_prompt(prompt))

	AIChatMessage.objects.create(thread=thread, role="user", content=prompt)

	try:
		assistant_text = _ask_ollama(_build_ollama_messages(thread, user))
	except RuntimeError as exc:
		return JsonResponse({"error": str(exc)}, status=502)

	if not assistant_text:
		assistant_text = "No response generated."

	assistant_message = AIChatMessage.objects.create(thread=thread, role="assistant", content=assistant_text)
	thread.save(update_fields=["updated_at"])

	return JsonResponse(
		{
			"thread": _serialize_thread(thread),
			"assistant_message": _serialize_message(assistant_message),
		}
	)


@csrf_exempt
@require_POST
def ai_chat_stream_view(request):
	user, error_response = _require_user(request)
	if error_response:
		return error_response

	try:
		data = json.loads(request.body.decode("utf-8"))
	except (json.JSONDecodeError, UnicodeDecodeError):
		return JsonResponse({"error": "Invalid JSON payload."}, status=400)

	prompt = str(data.get("message", "")).strip()
	thread_id = data.get("thread_id")
	if not prompt:
		return JsonResponse({"error": "Message is required."}, status=400)

	if thread_id:
		try:
			thread = AIChatThread.objects.get(id=thread_id, owner=user)
		except AIChatThread.DoesNotExist:
			return JsonResponse({"error": "Thread not found."}, status=404)
	else:
		thread = AIChatThread.objects.create(owner=user, title=_title_from_prompt(prompt))

	AIChatMessage.objects.create(thread=thread, role="user", content=prompt)

	def event_stream():
		assistant_text = ""
		yield json.dumps({"type": "thread", "thread": _serialize_thread(thread)}) + "\n"
		try:
			for chunk in _stream_ollama_text(_build_ollama_messages(thread, user)):
				assistant_text += chunk
				yield json.dumps({"type": "chunk", "content": chunk}) + "\n"
		except RuntimeError as exc:
			yield json.dumps({"type": "error", "error": str(exc)}) + "\n"
			return

		if not assistant_text:
			assistant_text = "No response generated."

		assistant_message = AIChatMessage.objects.create(thread=thread, role="assistant", content=assistant_text)
		thread.save(update_fields=["updated_at"])
		yield (
			json.dumps(
				{
					"type": "done",
					"thread": _serialize_thread(thread),
					"assistant_message": _serialize_message(assistant_message),
				}
			)
			+ "\n"
		)

	return StreamingHttpResponse(event_stream(), content_type="application/x-ndjson")


@csrf_exempt
@require_POST
def ai_thread_rename_view(request, thread_id):
	user, error_response = _require_user(request)
	if error_response:
		return error_response

	try:
		thread = AIChatThread.objects.get(id=thread_id, owner=user)
	except AIChatThread.DoesNotExist:
		return JsonResponse({"error": "Thread not found."}, status=404)

	try:
		data = json.loads(request.body.decode("utf-8"))
	except (json.JSONDecodeError, UnicodeDecodeError):
		return JsonResponse({"error": "Invalid JSON payload."}, status=400)

	title = str(data.get("title", "")).strip()
	if not title:
		return JsonResponse({"error": "Title is required."}, status=400)

	thread.title = title[:150]
	thread.save(update_fields=["title", "updated_at"])
	return JsonResponse({"thread": _serialize_thread(thread)})


@csrf_exempt
@require_http_methods(["POST"])
def ai_thread_delete_view(request, thread_id):
	user, error_response = _require_user(request)
	if error_response:
		return error_response

	try:
		thread = AIChatThread.objects.get(id=thread_id, owner=user)
	except AIChatThread.DoesNotExist:
		return JsonResponse({"error": "Thread not found."}, status=404)

	thread.delete()
	return JsonResponse({"message": "Thread deleted."})


@require_GET
def grade_report_view(request):
	user, error_response = _require_user(request)
	if error_response:
		return error_response
	role_error = _require_student_or_management(user)
	if role_error:
		return role_error

	mode = str(request.GET.get("mode", "semester")).strip().lower()
	class_name = str(request.GET.get("class_name", "")).strip()
	if user.user_type == SmartUser.STUDENT:
		target_student_user = user
		student_id = str(user.id)
	else:
		student_id = str(request.GET.get("student_id", "")).strip()
		target_student_user, validation_error = _management_validate_student(student_id, class_name)
		if validation_error:
			return validation_error
	rows = _resolve_student_rows_for_user(target_student_user, student_id)
	if not rows:
		return JsonResponse({"error": "No student records found."}, status=404)

	if mode == "curriculum":
		payload = _curriculum_report_payload(rows)
	else:
		payload = _semester_report_payload(rows)

	payload["student_id"] = student_id
	payload["class_name"] = class_name if user.user_type == SmartUser.MANAGEMENT else ""
	payload["mode"] = mode
	return JsonResponse(payload)


@csrf_exempt
@require_POST
def grade_report_predict_view(request):
	user, error_response = _require_user(request)
	if error_response:
		return error_response
	role_error = _require_student_or_management(user)
	if role_error:
		return role_error

	try:
		data = json.loads(request.body.decode("utf-8"))
	except (json.JSONDecodeError, UnicodeDecodeError):
		return JsonResponse({"error": "Invalid JSON payload."}, status=400)

	class_name = str(data.get("class_name", "")).strip()
	if user.user_type == SmartUser.STUDENT:
		target_student_user = user
		student_id = str(user.id)
	else:
		student_id = str(data.get("student_id", "")).strip()
		target_student_user, validation_error = _management_validate_student(student_id, class_name)
		if validation_error:
			return validation_error
	rows = _resolve_student_rows_for_user(target_student_user, student_id)
	if not rows:
		return JsonResponse({"error": "No student records found."}, status=404)

	client_sheet = data.get("result_sheet") or []
	if client_sheet:
		by_subject = {str(item.get("subject")): item for item in client_sheet if item.get("subject")}
		prepared_rows = []
		for row in rows:
			sheet_entry = by_subject.get(str(row.get("subject")), {})
			prepared_rows.append(_row_from_client_sheet(sheet_entry, row))
	else:
		prepared_rows = rows

	projected_rows = [_project_for_next_semester(row) for row in prepared_rows]
	overall, subject_predictions = _predict_rows(projected_rows)
	llm_output = _build_llm_prediction_analysis(student_id, subject_predictions, overall)

	return JsonResponse(
		{
			"student_id": student_id,
			"class_name": class_name if user.user_type == SmartUser.MANAGEMENT else "",
			"semester_3_prediction": overall,
			"subject_predictions": subject_predictions,
			"llm_output": llm_output,
			"analysis": {
				"subjects_count": len(subject_predictions),
				"source": "result_sheet_and_subject_numbers",
				"note": "Prediction generated for upcoming semester based on semester 1-2 report sheet and projected semester 3 values.",
			},
		}
	)


@csrf_exempt
@require_POST
def registration_submit_view(request):
	user, error_response = _require_user(request)
	if error_response:
		return error_response
	role_error = _require_management(user)
	if role_error:
		return role_error

	role, payload, profile_photo = _parse_registration_input(request)
	profile, validation_error = _save_registration(role, payload, user, profile_photo=profile_photo)
	if validation_error:
		return JsonResponse({"error": validation_error}, status=400)

	return JsonResponse(
		{
			"message": f"{role.title()} registration successful.",
			"registered_user": {
				"user_id": profile.smart_user.id,
				"username": profile.smart_user.name,
				"user_type": profile.smart_user.user_type,
			},
		}
	)


@require_GET
def registration_list_view(request):
	user, error_response = _require_user(request)
	if error_response:
		return error_response
	role_error = _require_management(user)
	if role_error:
		return role_error

	role = str(request.GET.get("role", "")).strip().lower()
	queryset = RegistrationProfile.objects.select_related("smart_user").all().order_by("-created_at")
	role_map = _role_map()
	if role in role_map:
		queryset = queryset.filter(role=role_map[role])

	items = [_serialize_registration_profile(item, request) for item in queryset]
	return JsonResponse({"items": items})


@csrf_exempt
@require_POST
def registration_update_view(request, profile_id):
	user, error_response = _require_user(request)
	if error_response:
		return error_response
	role_error = _require_management(user)
	if role_error:
		return role_error

	try:
		profile = RegistrationProfile.objects.select_related("smart_user").get(id=profile_id)
	except RegistrationProfile.DoesNotExist:
		return JsonResponse({"error": "Registration profile not found."}, status=404)

	role, payload, profile_photo = _parse_registration_input(request)
	if not role:
		role = _role_name_from_type(profile.role)

	updated_profile, validation_error = _save_registration(
		role,
		payload,
		user,
		profile_photo=profile_photo,
		existing_profile=profile,
	)
	if validation_error:
		return JsonResponse({"error": validation_error}, status=400)

	return JsonResponse(
		{
			"message": "Registration updated successfully.",
			"item": _serialize_registration_profile(updated_profile, request),
		}
	)


@csrf_exempt
@require_POST
def registration_delete_view(request, profile_id):
	user, error_response = _require_user(request)
	if error_response:
		return error_response
	role_error = _require_management(user)
	if role_error:
		return role_error

	try:
		profile = RegistrationProfile.objects.select_related("smart_user").get(id=profile_id)
	except RegistrationProfile.DoesNotExist:
		return JsonResponse({"error": "Registration profile not found."}, status=404)

	profile.smart_user.delete()
	return JsonResponse({"message": "Registration deleted successfully."})


@require_GET
def students_by_class_view(request):
	user, error_response = _require_user(request)
	if error_response:
		return error_response
	role_error = _require_management(user)
	if role_error:
		return role_error

	requested_class = str(request.GET.get("class_name", "")).strip()
	profiles = RegistrationProfile.objects.select_related("smart_user").filter(role=SmartUser.STUDENT)

	class_map = {str(index): [] for index in range(1, 11)}
	for profile in profiles:
		class_name = str((profile.profile_data or {}).get("class_semester_year", "")).strip()
		if requested_class and class_name != requested_class:
			continue
		if class_name in class_map:
			class_map[class_name].append(
				{
					"user_id": profile.smart_user.id,
					"username": profile.smart_user.name,
					"full_name": profile.profile_data.get("full_name", ""),
					"class_name": class_name,
				}
			)

	items = [{"class_name": key, "students": value} for key, value in class_map.items()]
	return JsonResponse({"items": items})


@csrf_exempt
@require_POST
def course_assignment_create_view(request):
	user, error_response = _require_user(request)
	if error_response:
		return error_response
	role_error = _require_management(user)
	if role_error:
		return role_error

	try:
		data = json.loads(request.body.decode("utf-8"))
	except (json.JSONDecodeError, UnicodeDecodeError):
		return JsonResponse({"error": "Invalid JSON payload."}, status=400)

	target_role = str(data.get("target_role", "")).strip().lower()
	course_name = str(data.get("course_name", "")).strip()
	normalized_course_name = _normalize_subject_name(course_name)
	class_name = str(data.get("class_name", "")).strip()
	notes = str(data.get("notes", "")).strip()
	slots = data.get("weekly_slots") or []
    
	valid_classes = {str(index) for index in range(1, 11)}

	def _normalized_class(value):
		text = str(value or "").strip()
		digits = "".join(ch for ch in text if ch.isdigit())
		if digits in valid_classes:
			return digits
		return text

	if not course_name:
		return JsonResponse({"error": "Course name is required."}, status=400)
	if normalized_course_name not in ALLOWED_SUBJECTS:
		return JsonResponse({"error": "course_name must be one of Physics, Chemistry, Biology, Math."}, status=400)
	if target_role not in ["student", "teacher"]:
		return JsonResponse({"error": "target_role must be student or teacher."}, status=400)

	raw_ids = data.get("target_user_ids") or []
	if data.get("target_user_id"):
		raw_ids = raw_ids + [data.get("target_user_id")]
	target_ids = []
	for raw_id in raw_ids:
		try:
			target_ids.append(int(raw_id))
		except (TypeError, ValueError):
			continue
	target_ids = sorted(set(target_ids))
	if not target_ids:
		return JsonResponse({"error": "At least one valid target user ID is required."}, status=400)

	if not isinstance(slots, list) or not slots:
		return JsonResponse({"error": "At least one weekly slot is required."}, status=400)

	if target_role == "student" and not class_name:
		return JsonResponse({"error": "class_name is required for student assignments."}, status=400)
	if target_role == "student" and class_name not in valid_classes:
		return JsonResponse({"error": "class_name must be numeric and between 1 and 10."}, status=400)

	role_code = SmartUser.STUDENT if target_role == "student" else SmartUser.TEACHER
	users = list(SmartUser.objects.filter(id__in=target_ids, user_type=role_code))
	if len(users) != len(target_ids):
		return JsonResponse({"error": "Some target users were not found for the selected role."}, status=400)

	if target_role == "student":
		invalid_students = []
		for target_user in users:
			profile = getattr(target_user, "registration_profile", None)
			student_class = _normalized_class((profile.profile_data or {}).get("class_semester_year", "")) if profile else ""
			if student_class != class_name:
				invalid_students.append(target_user.id)
		if invalid_students:
			return JsonResponse(
				{"error": f"These students do not match class_name '{class_name}': {invalid_students}"},
				status=400,
			)

	created_assignments = []
	with transaction.atomic():
		for target_user in users:
			assignment = CourseAssignment.objects.create(
				created_by=user,
				target_user=target_user,
				teacher_user=None,
				target_role=role_code,
				course_name=normalized_course_name,
				class_name=class_name if target_role == "student" else "",
				notes=notes,
			)
			for slot in slots:
				day = str(slot.get("day", "")).strip().lower()
				start_time = str(slot.get("start_time", "")).strip()
				end_time = str(slot.get("end_time", "")).strip()
				room = str(slot.get("room", "")).strip()
				if not day or not start_time or not end_time:
					continue
				WeeklyClassSchedule.objects.create(
					assignment=assignment,
					day_of_week=day,
					start_time=start_time,
					end_time=end_time,
					room=room,
				)
			created_assignments.append(assignment)

	if not created_assignments:
		return JsonResponse({"error": "No valid schedule slots were provided."}, status=400)

	return JsonResponse(
		{
			"message": "Course assignment created successfully.",
			"count": len(created_assignments),
			"items": [_serialize_schedule_item(item) for item in created_assignments],
		}
	)


@require_GET
def weekly_schedule_view(request):
	user, error_response = _require_user(request)
	if error_response:
		return error_response

	queryset = CourseAssignment.objects.select_related("target_user").prefetch_related("weekly_slots")
	if user.user_type in [SmartUser.STUDENT, SmartUser.TEACHER]:
		queryset = queryset.filter(target_user=user)

	items = [_serialize_schedule_item(item) for item in queryset.order_by("-created_at")]
	return JsonResponse({"items": items})


@require_GET
def teacher_students_view(request):
	user, error_response = _require_user(request)
	if error_response:
		return error_response
	role_error = _require_teacher(user)
	if role_error:
		return role_error

	assignments = CourseAssignment.objects.select_related("target_user").filter(
		target_role=SmartUser.STUDENT,
	)

	student_map = {}
	for assignment in assignments:
		profile = getattr(assignment.target_user, "registration_profile", None)
		full_name = (profile.profile_data or {}).get("full_name", "") if profile else ""
		student_map[assignment.target_user.id] = {
			"user_id": assignment.target_user.id,
			"username": assignment.target_user.name,
			"full_name": full_name,
			"class_name": assignment.class_name,
		}

	return JsonResponse({"items": list(student_map.values())})


@require_GET
def teacher_marks_view(request):
	user, error_response = _require_user(request)
	if error_response:
		return error_response
	role_error = _require_teacher(user)
	if role_error:
		return role_error

	student_id = request.GET.get("student_id")
	marks = StudentSubjectMark.objects.filter(teacher=user)
	if student_id:
		marks = marks.filter(student_id=student_id)

	items = [
		{
			"id": mark.id,
			"student_id": mark.student.id,
			"student_name": mark.student.name,
			"class_name": mark.class_name,
			"subject": mark.subject,
			"ct_1": mark.ct_1,
			"ct_2": mark.ct_2,
			"ct_3": mark.ct_3,
			"ct_4": mark.ct_4,
			"ct_5": mark.ct_5,
			"ct_6": mark.ct_6,
			"ct_7": mark.ct_7,
			"ct_8": mark.ct_8,
			"term_1": mark.term_1,
			"term_2": mark.term_2,
			"model_1": mark.model_1,
			"model_2": mark.model_2,
			"model_3": mark.model_3,
		}
		for mark in marks
	]
	return JsonResponse({"items": items})


@csrf_exempt
@require_POST
def teacher_mark_upsert_view(request):
	user, error_response = _require_user(request)
	if error_response:
		return error_response
	role_error = _require_teacher(user)
	if role_error:
		return role_error

	try:
		data = json.loads(request.body.decode("utf-8"))
	except (json.JSONDecodeError, UnicodeDecodeError):
		return JsonResponse({"error": "Invalid JSON payload."}, status=400)

	student_id = data.get("student_id")
	subject = str(data.get("subject", "")).strip()
	normalized_subject = _normalize_subject_name(subject)
	if not student_id or not subject:
		return JsonResponse({"error": "student_id and subject are required."}, status=400)
	if normalized_subject not in ALLOWED_SUBJECTS:
		return JsonResponse({"error": "subject must be one of Physics, Chemistry, Biology, Math."}, status=400)

	try:
		student_user = SmartUser.objects.get(id=int(student_id), user_type=SmartUser.STUDENT)
	except (TypeError, ValueError, SmartUser.DoesNotExist):
		return JsonResponse({"error": "Student not found."}, status=404)

	assignment = CourseAssignment.objects.filter(target_user=student_user, target_role=SmartUser.STUDENT).first()
	if not assignment:
		return JsonResponse({"error": "Student is not assigned in any course yet."}, status=403)

	defaults = {
		"class_name": assignment.class_name,
		"ct_1": _to_int(data.get("ct_1")),
		"ct_2": _to_int(data.get("ct_2")),
		"ct_3": _to_int(data.get("ct_3")),
		"ct_4": _to_int(data.get("ct_4")),
		"ct_5": _to_int(data.get("ct_5")),
		"ct_6": _to_int(data.get("ct_6")),
		"ct_7": _to_int(data.get("ct_7")),
		"ct_8": _to_int(data.get("ct_8")),
		"term_1": _to_int(data.get("term_1")),
		"term_2": _to_int(data.get("term_2")),
		"model_1": _to_int(data.get("model_1")),
		"model_2": _to_int(data.get("model_2")),
		"model_3": _to_int(data.get("model_3")),
	}
	mark, _created = StudentSubjectMark.objects.update_or_create(
		teacher=user,
		student=student_user,
		subject=normalized_subject,
		defaults=defaults,
	)

	return JsonResponse(
		{
			"message": "Marks saved successfully.",
			"item": {
				"id": mark.id,
				"student_id": mark.student.id,
				"subject": mark.subject,
				"class_name": mark.class_name,
			},
		}
	)


@csrf_exempt
@require_POST
def library_application_submit_view(request):
	user, error_response = _require_user(request)
	if error_response:
		return error_response

	role_error = _require_student_or_teacher(user)
	if role_error:
		return role_error

	try:
		data = json.loads(request.body.decode("utf-8"))
	except (json.JSONDecodeError, UnicodeDecodeError):
		return JsonResponse({"error": "Invalid JSON payload."}, status=400)

	resource_type = str(data.get("resource_type", "")).strip()
	explanation = str(data.get("explanation", "")).strip()

	student_resource_types = ["Books", "Technical", "Teacher", "Probation", "Others"]
	teacher_resource_types = ["Books", "Technical", "Student", "Special resources", "Others"]
	allowed = student_resource_types if user.user_type == SmartUser.STUDENT else teacher_resource_types

	if resource_type not in allowed:
		return JsonResponse({"error": "Invalid resource type for your role."}, status=400)
	if not explanation:
		return JsonResponse({"error": "Explanation is required."}, status=400)

	item = LibraryApplication.objects.create(
		requester=user,
		requester_role=user.user_type,
		resource_type=resource_type,
		explanation=explanation,
	)

	return JsonResponse(
		{
			"message": "Library application submitted successfully.",
			"item": {
				"id": item.id,
				"requester_id": user.id,
				"requester_name": user.name,
				"requester_role": _user_type_label(user.user_type),
				"resource_type": item.resource_type,
				"explanation": item.explanation,
				"created_at": item.created_at.isoformat(),
			},
		}
	)


@require_GET
def library_applications_view(request):
	user, error_response = _require_user(request)
	if error_response:
		return error_response

	queryset = LibraryApplication.objects.select_related("requester")
	if user.user_type != SmartUser.MANAGEMENT:
		queryset = queryset.filter(requester=user)

	items = [
		{
			"id": item.id,
			"requester_id": item.requester.id,
			"requester_name": item.requester.name,
			"requester_role": _user_type_label(item.requester_role),
			"resource_type": item.resource_type,
			"explanation": item.explanation,
			"created_at": item.created_at.isoformat(),
		}
		for item in queryset
	]

	return JsonResponse({"items": items})
