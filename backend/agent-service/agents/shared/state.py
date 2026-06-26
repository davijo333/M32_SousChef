# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# """Shared LangGraph state for the Sous Chef supervisor."""
#
# from __future__ import annotations
#
# from typing import Annotated, Any, Literal, TypedDict
#
# from langchain_core.messages import BaseMessage
# from langgraph.graph.message import add_messages
#
# SpecialistTarget = Literal["inventory", "business", "create"]
# RouteMode = Literal["answer", "consult", "handoff"]
#
#
# class ChatState(TypedDict, total=False):
#     messages: Annotated[list[BaseMessage], add_messages]
#     restaurant_id: str
#     chef_name: str
#     restaurant_name: str
#     finance_period: str
#     cues_text: str
#     confirm_suggestion: bool
#     confirm_inventory: bool
#     confirm_business: bool
#     user_id: str
#     recent_bill_ids: list[str]
#     upload_batch: dict | None
#     catalog_draft: dict | None
#     recipe_build: dict | None
#     context: str
#     active_agent: str
#     handoff: SpecialistTarget | None
#     suggestion_action: dict | None
#     pending_action: dict | None
#     # Supervisor routing
#     route_mode: RouteMode
#     consult_targets: list[SpecialistTarget]
#     consult_results: dict[str, str]
#     consult_index: int
#     user_question: str
#     workflow_state: dict[str, Any] | None
