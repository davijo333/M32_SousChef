"""LangGraph supervisor graph — Sous Chef routes, consults, and synthesizes."""

from __future__ import annotations

import os
from typing import Any, Literal

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

from agents.handoff import detect_suggested_handoff
from agents.prompts import ASSISTANT_NAMES, AgentContext
from agents.specialists import history_to_messages, result_from_core_ctx, run_react_agent
from agents.state import ChatState, RouteMode, SpecialistTarget
from tools.core.writes import CoreToolContext

MAX_CONSULTS = 3


class IntentDecision(BaseModel):
    """Structured routing decision from the supervisor classifier."""

    domains: list[Literal["inventory", "business", "create", "head"]] = Field(
        description="Which kitchen domains the question touches."
    )
    mode: RouteMode = Field(
        description=(
            "answer = Sous Chef handles alone; "
            "consult = pull specialist data then synthesize; "
            "handoff = chef should talk directly to a specialist."
        )
    )
    handoff_target: Literal["inventory", "business", "create"] | None = Field(
        default=None,
        description="When mode=handoff, which specialist to connect.",
    )
    reasoning: str = Field(description="Brief routing rationale.")


def _model() -> ChatOpenAI:
    return ChatOpenAI(model="gpt-4o-mini", temperature=0.1, api_key=os.getenv("OPENAI_API_KEY"))


def _classifier_prompt(user_question: str) -> str:
    return f"""You are the routing classifier for Sous Chef, a restaurant kitchen supervisor.

Classify the chef's message and choose how to handle it:

- **answer** — broad triage, daily priorities, or simple snapshot questions Sous Chef can answer from summaries.
- **consult** — needs live specialist data (stock, sales, menu ideas). Set domains to the specialists needed (1–3).
- **handoff** — chef explicitly wants to talk to a specialist, or needs deep ongoing work in one domain.

Domain guide:
- inventory: stock, expiry, reorder, pantry, purchase bills
- business: sales, margins, COGS, POS, supplier purchases
- create: specials, new dishes, seasonal ideas, saving suggestions
- head: general triage only (use with mode=answer)

Chef message:
{user_question}
"""


def classify_intent(state: ChatState) -> dict[str, Any]:
    if state.get("route_mode") == "handoff":
        return {}

    question = state.get("user_question") or ""
    if not question.strip():
        return {
            "route_mode": "answer",
            "consult_targets": [],
            "active_agent": "head",
        }

    structured = _model().with_structured_output(IntentDecision)
    decision: IntentDecision = structured.invoke([HumanMessage(content=_classifier_prompt(question))])

    consult_targets: list[SpecialistTarget] = []
    for domain in decision.domains:
        if domain in ("inventory", "business", "create"):
            consult_targets.append(domain)

    if decision.mode == "handoff" and decision.handoff_target:
        return {
            "route_mode": "handoff",
            "consult_targets": [decision.handoff_target],
            "handoff": decision.handoff_target,
            "active_agent": decision.handoff_target,
        }

    if decision.mode == "consult" and consult_targets:
        return {
            "route_mode": "consult",
            "consult_targets": consult_targets[:MAX_CONSULTS],
            "consult_index": 0,
            "consult_results": {},
            "active_agent": "head",
        }

    return {
        "route_mode": "answer",
        "consult_targets": [],
        "active_agent": "head",
    }


def _consult_question(state: ChatState, target: SpecialistTarget) -> str:
    question = state.get("user_question") or "Help the chef with their request."
    return (
        f"The Sous Chef supervisor is consulting you. Answer concisely with tool data only.\n"
        f"Chef question: {question}"
    )


def run_consult_step(state: ChatState) -> dict[str, Any]:
    targets = state.get("consult_targets") or []
    index = state.get("consult_index") or 0
    if index >= len(targets):
        return {}

    target = targets[index]
    core_ctx = CoreToolContext(
        user_id=state.get("user_id") or "",
        upload_batch=state.get("upload_batch"),
        confirm_inventory=bool(state.get("confirm_inventory")),
        confirm_business=bool(state.get("confirm_business")),
        confirm_suggestion=bool(state.get("confirm_suggestion")),
    )
    reply = run_react_agent(
        target,  # type: ignore[arg-type]
        restaurant_id=state["restaurant_id"],
        user_id=state.get("user_id") or "",
        recent_bill_ids=state.get("recent_bill_ids") or [],
        chef_name=state.get("chef_name") or "Chef",
        restaurant_name=state.get("restaurant_name") or "your kitchen",
        finance_period=state.get("finance_period") or "week",
        cues_text=state.get("cues_text") or "",
        core_ctx=core_ctx,
        history=[],
        user_message=_consult_question(state, target),
    )

    results = dict(state.get("consult_results") or {})
    results[target] = reply or "(No specialist response)"

    update: dict[str, Any] = {
        "consult_results": results,
        "consult_index": index + 1,
    }
    update.update(result_from_core_ctx(core_ctx))
    return update


def synthesize_response(state: ChatState) -> dict[str, Any]:
    question = state.get("user_question") or ""
    results = state.get("consult_results") or {}
    chef = state.get("chef_name") or "Chef"
    kitchen = state.get("restaurant_name") or "your kitchen"

    if not results:
        return {}

    blocks = "\n\n".join(
        f"**{ASSISTANT_NAMES.get(target, target)}:**\n{text}" for target, text in results.items()
    )
    prompt = f"""You are **Sous Chef**, helping Chef {chef} at {kitchen}.

The chef asked: {question}

You consulted specialists. Synthesize ONE clear answer in your voice. Use their data; do not invent figures.
If a specialist recommended handoff for deeper work, name the agent and mention the Connect button.

Specialist consult results:
{blocks}
"""
    response = _model().invoke([SystemMessage(content=prompt)])
    reply = str(response.content or "").strip()
    return {"messages": [AIMessage(content=reply)], "active_agent": "head"}


def run_head_answer(state: ChatState) -> dict[str, Any]:
    core_ctx = CoreToolContext(
        user_id=state.get("user_id") or "",
        upload_batch=state.get("upload_batch"),
        confirm_inventory=bool(state.get("confirm_inventory")),
        confirm_business=bool(state.get("confirm_business")),
        confirm_suggestion=bool(state.get("confirm_suggestion")),
    )
    history_rows = [
        {"role": "user" if isinstance(m, HumanMessage) else "assistant", "content": str(m.content)}
        for m in (state.get("messages") or [])
        if isinstance(m, (HumanMessage, AIMessage)) and m.content
    ][:-1]

    reply = run_react_agent(
        "head",
        restaurant_id=state["restaurant_id"],
        user_id=state.get("user_id") or "",
        recent_bill_ids=state.get("recent_bill_ids") or [],
        chef_name=state.get("chef_name") or "Chef",
        restaurant_name=state.get("restaurant_name") or "your kitchen",
        finance_period=state.get("finance_period") or "week",
        cues_text=state.get("cues_text") or "",
        core_ctx=core_ctx,
        history=history_rows,
        user_message=state.get("user_question") or "",
    )
    update: dict[str, Any] = {
        "messages": [AIMessage(content=reply)],
        "active_agent": "head",
    }
    update.update(result_from_core_ctx(core_ctx))
    return update


def run_handoff_specialist(state: ChatState) -> dict[str, Any]:
    target = state.get("handoff") or (state.get("consult_targets") or ["inventory"])[0]
    core_ctx = CoreToolContext(
        user_id=state.get("user_id") or "",
        upload_batch=state.get("upload_batch"),
        confirm_inventory=bool(state.get("confirm_inventory")),
        confirm_business=bool(state.get("confirm_business")),
        confirm_suggestion=bool(state.get("confirm_suggestion")),
    )
    history_rows = [
        {"role": "user" if isinstance(m, HumanMessage) else "assistant", "content": str(m.content)}
        for m in (state.get("messages") or [])
        if isinstance(m, (HumanMessage, AIMessage)) and m.content
    ][:-1]

    reply = run_react_agent(
        target,  # type: ignore[arg-type]
        restaurant_id=state["restaurant_id"],
        user_id=state.get("user_id") or "",
        recent_bill_ids=state.get("recent_bill_ids") or [],
        chef_name=state.get("chef_name") or "Chef",
        restaurant_name=state.get("restaurant_name") or "your kitchen",
        finance_period=state.get("finance_period") or "week",
        cues_text=state.get("cues_text") or "",
        core_ctx=core_ctx,
        history=history_rows,
        user_message=state.get("user_question") or "",
        handoff_note=(
            "\n\nThe chef was connected to you from Sous Chef. Acknowledge the thread briefly, then help."
        ),
    )

    specialist = ASSISTANT_NAMES.get(target, target)
    if reply and not __import__("re").search(r"you're now connected with", reply, __import__("re").I):
        reply = f"You're now connected with the **{specialist}**.\n\n{reply}"

    update: dict[str, Any] = {
        "messages": [AIMessage(content=reply)],
        "active_agent": target,
        "handoff": target,
    }
    update.update(result_from_core_ctx(core_ctx))
    return update


def route_after_classify(state: ChatState) -> str:
    mode = state.get("route_mode") or "answer"
    if mode == "handoff":
        return "handoff_specialist"
    if mode == "consult":
        return "consult_specialist"
    return "head_answer"


def route_after_consult(state: ChatState) -> str:
    targets = state.get("consult_targets") or []
    index = state.get("consult_index") or 0
    if index < len(targets):
        return "consult_specialist"
    return "synthesize"


def build_supervisor_graph():
    graph = StateGraph(ChatState)

    graph.add_node("classify_intent", classify_intent)
    graph.add_node("consult_specialist", run_consult_step)
    graph.add_node("synthesize", synthesize_response)
    graph.add_node("head_answer", run_head_answer)
    graph.add_node("handoff_specialist", run_handoff_specialist)

    graph.add_edge(START, "classify_intent")
    graph.add_conditional_edges(
        "classify_intent",
        route_after_classify,
        {
            "handoff_specialist": "handoff_specialist",
            "consult_specialist": "consult_specialist",
            "head_answer": "head_answer",
        },
    )
    graph.add_conditional_edges(
        "consult_specialist",
        route_after_consult,
        {
            "consult_specialist": "consult_specialist",
            "synthesize": "synthesize",
        },
    )
    graph.add_edge("synthesize", END)
    graph.add_edge("head_answer", END)
    graph.add_edge("handoff_specialist", END)

    return graph.compile()


_supervisor_graph = None


def get_supervisor_graph():
    global _supervisor_graph
    if _supervisor_graph is None:
        _supervisor_graph = build_supervisor_graph()
    return _supervisor_graph


def run_supervisor_chat(
    *,
    restaurant_id: str,
    user_id: str = "",
    upload_batch: dict | None = None,
    recent_bill_ids: list[str] | None = None,
    chef_name: str,
    restaurant_name: str,
    message: str,
    history: list[dict[str, str]],
    finance_period: str = "week",
    cues_text: str = "",
    confirm_suggestion: bool = False,
    confirm_inventory: bool = False,
    confirm_business: bool = False,
    connect_agent: AgentContext | None = None,
) -> dict[str, Any]:
    graph = get_supervisor_graph()
    result = graph.invoke(
        {
            "messages": _history_messages(history, message),
            "restaurant_id": restaurant_id,
            "user_id": user_id,
            "upload_batch": upload_batch,
            "recent_bill_ids": recent_bill_ids or [],
            "chef_name": chef_name,
            "restaurant_name": restaurant_name,
            "finance_period": finance_period,
            "cues_text": cues_text,
            "confirm_suggestion": confirm_suggestion,
            "confirm_inventory": confirm_inventory,
            "confirm_business": confirm_business,
            "context": "head",
            "user_question": message,
            "consult_targets": [],
            "consult_index": 0,
            "consult_results": {},
        }
    )

    reply = ""
    for msg in reversed(result.get("messages", [])):
        if isinstance(msg, AIMessage) and msg.content:
            reply = str(msg.content)
            break

    active_agent = result.get("active_agent") or "head"
    result_handoff = result.get("handoff")
    if not result_handoff and active_agent == "head":
        result_handoff = detect_suggested_handoff(reply)

    return {
        "reply": reply or _fallback("head"),
        "agent_context": active_agent,
        "handoff": result_handoff,
        "suggestion_action": result.get("suggestion_action"),
        "pending_action": result.get("pending_action"),
    }


def _history_messages(history: list[dict[str, str]], message: str) -> list[Any]:
    return history_to_messages(history) + [HumanMessage(content=message)]


def _fallback(agent_context: str) -> str:
    inventory = ASSISTANT_NAMES["inventory"]
    business = ASSISTANT_NAMES["business"]
    creative = ASSISTANT_NAMES["create"]
    return (
        f"Ask me what to prioritize today. For stock, sales, or specials, I can point you to "
        f"the {inventory}, {business}, or {creative}."
    )
