from django.urls import path

from .views import (
    ai_chat_view,
    ai_chat_stream_view,
    ai_thread_delete_view,
    ai_thread_messages_view,
    ai_thread_rename_view,
    ai_threads_view,
    dashboard_view,
    grade_report_predict_view,
    grade_report_view,
    login_view,
    logout_view,
    session_view,
)

urlpatterns = [
    path("login/", login_view, name="api-login"),
    path("logout/", logout_view, name="api-logout"),
    path("session/", session_view, name="api-session"),
    path("dashboard/", dashboard_view, name="api-dashboard"),
    path("ai/threads/", ai_threads_view, name="api-ai-threads"),
    path("ai/threads/<int:thread_id>/messages/", ai_thread_messages_view, name="api-ai-thread-messages"),
    path("ai/threads/<int:thread_id>/rename/", ai_thread_rename_view, name="api-ai-thread-rename"),
    path("ai/threads/<int:thread_id>/delete/", ai_thread_delete_view, name="api-ai-thread-delete"),
    path("ai/chat/", ai_chat_view, name="api-ai-chat"),
    path("ai/chat/stream/", ai_chat_stream_view, name="api-ai-chat-stream"),
    path("grade-report/", grade_report_view, name="api-grade-report"),
    path("grade-report/predict/", grade_report_predict_view, name="api-grade-report-predict"),
]
