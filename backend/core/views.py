import json
import pickle
from pathlib import Path
from functools import lru_cache
import csv
from urllib import error, request
import pandas as pd

from django.http import JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .models import AIChatMessage, AIChatThread, SmartUser

OLLAMA_MODEL = "hf.co/unsloth/Llama-3.2-1B-Instruct-GGUF:UD-Q4_K_XL"
OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = PROJECT_ROOT / "MLModel" / "best_pass_fail_model.pkl"
DATASET_PATH = PROJECT_ROOT / "MLModel" / "student_dataset_500_rows.csv"


def _menu_payload():
	return {
		"top": {
			"title": "ASEMS",
			"items": ["Courses and Result", "Registration", "Grade Report"],
			"profile_dropdown": ["Profile", "Settings", "Logout"],
		},
		"left": [
			"Academics",
			"Grade Reports",
			"Library",
			"Others",
			"AI Help",
			"Notifications",
		],
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
			rows.append(row)
	return rows


@lru_cache(maxsize=1)
def _load_prediction_model():
	with open(MODEL_PATH, "rb") as handle:
		return pickle.load(handle)


def _student_rows(student_id):
	rows = [row for row in _load_dataset_rows() if str(row.get("student_id")) == str(student_id)]
	if rows:
		return rows

	all_rows = _load_dataset_rows()
	if not all_rows:
		return []

	first_id = all_rows[0].get("student_id")
	return [row for row in all_rows if row.get("student_id") == first_id]


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
			"menus": _menu_payload(),
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
		return JsonResponse({"authenticated": False, "menus": _menu_payload()})

	return JsonResponse(
		{
			"authenticated": True,
			"user": _serialize_user(user),
			"menus": _menu_payload(),
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
			"menus": _menu_payload(),
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

	mode = str(request.GET.get("mode", "semester")).strip().lower()
	student_id = str(request.GET.get("student_id", user.id)).strip()
	rows = _student_rows(student_id)
	if not rows:
		return JsonResponse({"error": "No student records found."}, status=404)

	if mode == "curriculum":
		payload = _curriculum_report_payload(rows)
	else:
		payload = _semester_report_payload(rows)

	payload["student_id"] = student_id
	payload["mode"] = mode
	return JsonResponse(payload)


@csrf_exempt
@require_POST
def grade_report_predict_view(request):
	user, error_response = _require_user(request)
	if error_response:
		return error_response

	try:
		data = json.loads(request.body.decode("utf-8"))
	except (json.JSONDecodeError, UnicodeDecodeError):
		return JsonResponse({"error": "Invalid JSON payload."}, status=400)

	student_id = str(data.get("student_id", user.id)).strip()
	rows = _student_rows(student_id)
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
