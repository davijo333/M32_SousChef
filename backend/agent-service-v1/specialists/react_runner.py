"""LangGraph ReAct runner for specialist workers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langgraph.prebuilt import create_react_agent

from domain.context import TurnContext
from domain.specialists import SpecialistId
from integrations.openai.client import chat_model
from prompts.builder import build_specialist_prompt
from tools.core.writes import CoreToolContext
from tools.registry import get_tools_for_specialist


@dataclass
class SpecialistResult:
    reply: str
    core_ctx: CoreToolContext
    pending_action: dict[str, Any] | None = None
    recipe_build: dict[str, Any] | None = None
    navigation_action: dict[str, Any] | None = None


def build_core_ctx(ctx: TurnContext) -> CoreToolContext:
    return CoreToolContext(
        user_id=ctx.user_id,
        upload_batch=ctx.upload_batch,
        catalog_draft=ctx.catalog_draft,
        recipe_build=ctx.recipe_build,
        confirm_inventory=ctx.confirm_inventory,
        confirm_business=ctx.confirm_business,
        confirm_suggestion=ctx.confirm_suggestion or ctx.confirm_inventory,
    )


def _history_to_messages(ctx: TurnContext) -> list[BaseMessage]:
    messages: list[BaseMessage] = []
    for row in ctx.history[-10:]:
        if row.role == "assistant":
            messages.append(AIMessage(content=row.content))
        elif row.role == "user":
            messages.append(HumanMessage(content=row.content))
    return messages


def _extract_final_reply(result: dict[str, Any]) -> str:
    for msg in reversed(result.get("messages", [])):
        if isinstance(msg, AIMessage) and msg.content and not getattr(msg, "tool_calls", None):
            return str(msg.content)
        if isinstance(msg, AIMessage) and msg.content:
            return str(msg.content)
    return ""


def _side_effects(core_ctx: CoreToolContext) -> dict[str, Any]:
    out: dict[str, Any] = {}
    pending = core_ctx.latest_pending()
    if pending:
        out["pending_action"] = pending
    navigation = core_ctx.latest_navigation()
    if navigation:
        out["navigation_action"] = navigation
    if core_ctx.recipe_build:
        out["recipe_build"] = core_ctx.recipe_build
    return out


def run_react_specialist(
    specialist_id: SpecialistId,
    ctx: TurnContext,
    *,
    task_prompt: str,
    core_ctx: CoreToolContext | None = None,
) -> SpecialistResult:
    """Run one ReAct consult turn with real tools."""
    tool_ctx = core_ctx or build_core_ctx(ctx)
    system_prompt = build_specialist_prompt(
        specialist_id,
        chef_name=ctx.chef_name,
        restaurant_name=ctx.restaurant_name,
        data_context="",
        task_prompt=task_prompt,
    )
    tools = get_tools_for_specialist(
        specialist_id,
        restaurant_id=ctx.restaurant_id,
        user_id=ctx.user_id,
        finance_period=ctx.finance_period,
        cues_text=ctx.cues_text,
        core_ctx=tool_ctx,
        recent_bill_ids=ctx.recent_bill_ids or None,
    )
    agent = create_react_agent(chat_model(), tools, prompt=system_prompt)
    user_content = task_prompt.strip() or ctx.user_message.strip() or "Proceed with the workflow step."
    input_messages = _history_to_messages(ctx) + [HumanMessage(content=user_content)]
    result = agent.invoke({"messages": input_messages})
    reply = _extract_final_reply(result) or "Done."
    effects = _side_effects(tool_ctx)
    return SpecialistResult(
        reply=reply,
        core_ctx=tool_ctx,
        pending_action=effects.get("pending_action"),
        recipe_build=effects.get("recipe_build"),
        navigation_action=effects.get("navigation_action"),
    )
