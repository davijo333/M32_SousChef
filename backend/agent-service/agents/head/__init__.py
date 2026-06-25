"""Sous Chef (head) — persona specs, routing graph, and orchestration rules."""

from agents.head.graph import run_supervisor_chat
from agents.head.orchestration import (
    detect_add_dish_intent,
    detect_kitchen_workflow_message,
    detect_pantry_add_zero_confirm,
    format_orchestration_reply,
    infer_locked_dish,
    recent_user_messages,
    resolve_workflow_consults,
)

__all__ = [
    "detect_add_dish_intent",
    "detect_kitchen_workflow_message",
    "detect_pantry_add_zero_confirm",
    "format_orchestration_reply",
    "infer_locked_dish",
    "recent_user_messages",
    "resolve_workflow_consults",
    "run_supervisor_chat",
]
