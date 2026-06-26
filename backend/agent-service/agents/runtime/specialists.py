# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# """Build and run LangGraph ReAct specialist agents."""
#
# from __future__ import annotations
#
# from typing import Any
#
# from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
# from langchain_openai import ChatOpenAI
#
# from config import settings
# from langgraph.prebuilt import create_react_agent
#
# from agents.shared import spec_loader
# from agents.shared.prompts import AgentContext, build_system_prompt
# from context.builders import (
#     build_business_context,
#     build_creative_context,
#     build_head_context,
#     build_inventory_context,
# )
# from tools.core.factory import make_core_tools_for_agent
# from tools.core.writes import CoreToolContext
#
# ChatMessage = dict[str, str]
#
#
# def _model() -> ChatOpenAI:
#     return ChatOpenAI(model="gpt-4o-mini", temperature=0.3, api_key=settings.OPENAI_API_KEY)
#
#
# def _data_context(
#     agent_context: AgentContext,
#     restaurant_id: str,
#     finance_period: str,
#     cues_text: str,
# ) -> str:
#     if agent_context == "inventory":
#         return build_inventory_context(restaurant_id)
#     if agent_context == "business":
#         return build_business_context(restaurant_id, finance_period)
#     if agent_context == "head":
#         return build_head_context(restaurant_id, finance_period)
#     return build_creative_context(restaurant_id, cues_text)
#
#
# def _create_extras(agent_context: AgentContext) -> str:
#     if agent_context == "inventory":
#         return spec_loader.load_tool_instructions("inventory")
#     if agent_context == "business":
#         return spec_loader.load_tool_instructions("business")
#     if agent_context == "create":
#         return spec_loader.load_tool_instructions("create")
#     if agent_context == "head":
#         return spec_loader.load_tool_instructions("head")
#     return (
#         "Read-only: query_menu (cues, search_dishes, suggested, promotion_targets) and "
#         "query_inventory (expiring, search).\n"
#         "Draft recipes in chat — delegate all saves to Inventory Agent (Connect)."
#     )
#
#
# def build_react_agent(
#     agent_context: AgentContext,
#     *,
#     restaurant_id: str,
#     user_id: str,
#     recent_bill_ids: list[str],
#     chef_name: str,
#     restaurant_name: str,
#     finance_period: str,
#     cues_text: str,
#     core_ctx: CoreToolContext,
#     handoff_note: str = "",
#     create_extras: str = "",
# ):
#     extras = create_extras or _create_extras(agent_context)
#     system_prompt = build_system_prompt(
#         agent_context,
#         chef_name,
#         restaurant_name,
#         _data_context(agent_context, restaurant_id, finance_period, cues_text),
#         extras=extras,
#         handoff_note=handoff_note,
#     )
#     tools = make_core_tools_for_agent(
#         agent_context,
#         restaurant_id=restaurant_id,
#         user_id=user_id,
#         finance_period=finance_period,
#         cues_text=cues_text,
#         recent_bill_ids=recent_bill_ids,
#         ctx=core_ctx,
#     )
#     return create_react_agent(_model(), tools, prompt=system_prompt)
#
#
# def history_to_messages(history: list[ChatMessage]) -> list[BaseMessage]:
#     messages: list[BaseMessage] = []
#     for row in history[-10:]:
#         role = row.get("role", "user")
#         content = row.get("content", "")
#         if role == "assistant":
#             messages.append(AIMessage(content=content))
#         elif role == "user":
#             messages.append(HumanMessage(content=content))
#     return messages
#
#
# def extract_final_reply(result: dict[str, Any]) -> str:
#     for msg in reversed(result.get("messages", [])):
#         if isinstance(msg, AIMessage) and msg.content and not getattr(msg, "tool_calls", None):
#             return str(msg.content)
#         if isinstance(msg, AIMessage) and msg.content:
#             return str(msg.content)
#     return ""
#
#
# def run_react_agent(
#     agent_context: AgentContext,
#     *,
#     restaurant_id: str,
#     user_id: str = "",
#     recent_bill_ids: list[str] | None = None,
#     chef_name: str,
#     restaurant_name: str,
#     finance_period: str,
#     cues_text: str,
#     confirm_suggestion: bool = False,
#     confirm_inventory: bool = False,
#     confirm_business: bool = False,
#     core_ctx: CoreToolContext | None = None,
#     history: list[ChatMessage],
#     user_message: str,
#     handoff_note: str = "",
#     create_extras: str = "",
# ) -> str:
#     ctx = core_ctx or CoreToolContext(
#         user_id=user_id,
#         confirm_inventory=confirm_inventory,
#         confirm_business=confirm_business,
#         confirm_suggestion=confirm_suggestion,
#     )
#     agent = build_react_agent(
#         agent_context,
#         restaurant_id=restaurant_id,
#         user_id=user_id,
#         recent_bill_ids=recent_bill_ids or [],
#         chef_name=chef_name,
#         restaurant_name=restaurant_name,
#         finance_period=finance_period,
#         cues_text=cues_text,
#         core_ctx=ctx,
#         handoff_note=handoff_note,
#         create_extras=create_extras,
#     )
#     input_messages = history_to_messages(history) + [HumanMessage(content=user_message)]
#     result = agent.invoke({"messages": input_messages})
#     return extract_final_reply(result)
#
#
# def result_from_core_ctx(core_ctx: CoreToolContext) -> dict[str, Any]:
#     out: dict[str, Any] = {}
#     if core_ctx.suggestion_sink and not core_ctx.recipe_build:
#         draft = core_ctx.suggestion_sink[-1]
#         out["suggestion_action"] = {
#             "name": draft.name,
#             "description": draft.description,
#             "classification": draft.classification,
#             "ingredientSlugs": draft.ingredient_slugs,
#             "notes": [note.model_dump() for note in draft.notes],
#         }
#     pending = core_ctx.latest_pending()
#     if pending:
#         out["pending_action"] = pending
#     navigation = core_ctx.latest_navigation()
#     if navigation:
#         out["navigation_action"] = navigation
#     if core_ctx.recipe_build:
#         out["recipe_build"] = core_ctx.recipe_build
#     return out
