"""LangGraph supervisor graph — Sous Chef routes, consults, and synthesizes."""

from __future__ import annotations

import re
from typing import Any, Literal

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from config import settings
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

from agents.head.orchestration import (
    detect_add_dish_intent,
    detect_add_ingredient_intent,
    detect_add_addon_intent,
    detect_add_dish_build_message,
    detect_dish_catalog_update_message,
    detect_price_adjustment_confirm,
    detect_update_addon_intent,
    detect_update_dish_intent,
    detect_update_ingredient_intent,
    detect_kitchen_workflow_message,
    format_orchestration_reply,
    infer_locked_dish,
    resolve_workflow_consults,
)
from agents.shared.prompts import ASSISTANT_NAMES, AgentContext
from agents.runtime.specialists import history_to_messages, result_from_core_ctx, run_react_agent
from agents.shared.state import ChatState, RouteMode, SpecialistTarget
from tools.core.writes import CoreToolContext
from tools.core.catalog_draft_helpers import (
    apply_catalog_draft_correction,
    extract_dish_name_correction_from_thread,
)

MAX_CONSULTS = 3


def _infer_locked_dish(state: ChatState) -> str:
    return infer_locked_dish(state)


def _recent_user_messages(state: ChatState, limit: int = 6) -> list[str]:
    from agents.head.orchestration import recent_user_messages

    return recent_user_messages(state, limit=limit)


def _ensure_next_step(reply: str, state: ChatState) -> str:
    from agents.head.orchestration import (
        thread_awaiting_kitchen_save_confirm,
        thread_has_kitchen_build_in_thread,
        thread_has_recipe_draft,
    )

    text = (reply or "").strip()
    if not text:
        return "What would you like to do next?"
    if "?" in text:
        return text

    history = [
        {"role": "user" if isinstance(m, HumanMessage) else "assistant", "content": str(m.content)}
        for m in (state.get("messages") or [])
        if isinstance(m, (HumanMessage, AIMessage)) and m.content
    ]
    if (
        thread_awaiting_kitchen_save_confirm(history)
        or (thread_has_recipe_draft(history) and not thread_has_kitchen_build_in_thread(history))
        or state.get("recipe_build")
    ):
        return text

    consulted = list((state.get("consult_results") or {}).keys())
    if "business" in consulted:
        next_q = "Would you like me to run a pricing and margin pass next?"
    elif "inventory" in consulted:
        next_q = "Should I prepare the missing ingredients and reorder recommendations next?"
    elif "create" in consulted:
        catalog = state.get("catalog_draft") or {}
        if catalog.get("chefCorrected") or extract_dish_name_correction_from_thread(
            state.get("user_question") or "", None
        ):
            next_q = "Say **go ahead** when you want me to add the dish, ingredients, and recipe."
        else:
            next_q = "Would you like me to convert this into a full kitchen build now?"
    else:
        next_q = "What should we do next?"
    return f"{text}\n\n{next_q}"


class IntentDecision(BaseModel):
    """Structured routing decision from the supervisor classifier."""

    domains: list[Literal["inventory", "business", "create", "head"]] = Field(
        description="Which kitchen domains the question touches."
    )
    mode: RouteMode = Field(
        description=(
            "answer = Sous Chef handles alone; "
            "consult = pull specialist data then synthesize; "
            "handoff = explicit connect request only."
        )
    )
    handoff_target: Literal["inventory", "business", "create"] | None = Field(
        default=None,
        description="When mode=handoff, which specialist to connect.",
    )
    reasoning: str = Field(description="Brief routing rationale.")


def _model() -> ChatOpenAI:
    return ChatOpenAI(model="gpt-4o-mini", temperature=0.1, api_key=settings.OPENAI_API_KEY)


def _classifier_prompt(user_question: str) -> str:
    return f"""You are the routing classifier for Sous Chef, a restaurant kitchen supervisor.

Classify the chef's message and choose how to handle it:

- **answer** — broad triage, daily priorities, or simple snapshot questions Sous Chef can answer from summaries.
- **consult** — needs live specialist data (stock, sales, menu ideas). Set domains to the specialists needed (1–3).
- **handoff** — only when the chef explicitly asks to connect/switch chat agent.

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

    workflow = resolve_workflow_consults(state)
    if workflow:
        return workflow

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
            "route_mode": "consult",
            "consult_targets": [decision.handoff_target],
            "consult_index": 0,
            "consult_results": {},
            "active_agent": "head",
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


def _catalog_draft_block(state: ChatState) -> str:
    catalog_draft = state.get("catalog_draft") or {}
    name = str(catalog_draft.get("name") or "").strip()
    if not name:
        return ""
    item_type = str(catalog_draft.get("itemType") or "ingredient").strip().lower()
    classification = str(catalog_draft.get("classification") or "").strip()
    description = str(catalog_draft.get("description") or "").strip()
    category = str(catalog_draft.get("category") or "").strip()
    lines = [f"\n\nCatalog draft ({item_type}): **{name}**."]
    if category:
        lines.append(f"Category: {category}.")
    if classification:
        lines.append(f"Classification: {classification}.")
    if description:
        lines.append(f"Description: {description[:160]}.")
    if catalog_draft.get("chefCorrected"):
        lines.append("Chef corrected the name after photo vision — this overrides the photo label.")
    if state.get("confirm_suggestion") and item_type == "dish":
        lines.append(
            "Chef already confirmed — use plan_recipe_build then finalize_recipe_build; do not ask again."
        )
    return " ".join(lines)


def _consult_question(state: ChatState, target: SpecialistTarget) -> str:
    question = state.get("user_question") or "Help the chef with their request."
    locked_dish = _infer_locked_dish(state)
    recent_messages = _recent_user_messages(state, limit=4)

    prior = state.get("consult_results") or {}
    prior_block = ""
    if prior:
        snippets = "\n\n".join(f"{k}: {v}" for k, v in prior.items())
        prior_block = (
            "\n\nPrior specialist notes in this same request:\n"
            f"{snippets}\n"
            "Use these notes as context and add only what is missing."
        )
    lock_block = ""
    if locked_dish:
        lock_block = (
            f"\n\nLocked dish context: **{locked_dish}**.\n"
            "The chef's name correction overrides any photo vision label. "
            "Stay on this dish only — do not ask whether to keep an old photo name. "
            "If details are missing, ask Sous Chef for clarification instead of guessing."
        )
    history_block = ""
    if recent_messages:
        rendered = "\n".join(f"- {row}" for row in recent_messages)
        history_block = f"\n\nRecent chef messages:\n{rendered}"

    role_block = _specialist_task_block(state, target)
    return (
        f"The Sous Chef supervisor is consulting you. You MUST call your write tools when confirmed — "
        f"never claim work is done without a tool result.\n"
        f"Chef question: {question}{lock_block}{_catalog_draft_block(state)}{history_block}{prior_block}"
        f"{role_block}"
    )


def _specialist_task_block(state: ChatState, target: SpecialistTarget) -> str:
    locked = _infer_locked_dish(state)
    dish = locked or str((state.get("catalog_draft") or {}).get("name") or "").strip()
    recipe_build = state.get("recipe_build")
    if target == "inventory":
        question = state.get("user_question") or ""
        ingredient_name = detect_add_ingredient_intent(question)
        if ingredient_name:
            return (
                f"\n\n**Your task (Inventory Agent):** Add pantry item **{ingredient_name}**. "
                "Call query_inventory search, then apply_inventory create_ingredient "
                f"(name={ingredient_name!r}, qty 0, label new). Do not consult Creative."
            )
        simple_addon = detect_add_addon_intent(question)
        if simple_addon:
            return (
                f"\n\n**Your task (Inventory Agent):** Add add-on **{simple_addon}**. "
                "Call query_menu addons / search for duplicates, then apply_menu create_addon. "
                "Do not consult Creative — add-ons are catalog rows only."
            )
        update_ing = detect_update_ingredient_intent(question)
        if update_ing:
            return (
                f"\n\n**Your task (Inventory Agent):** Update pantry item **{update_ing}**. "
                "Call query_inventory ingredient_detail, then apply_inventory update_ingredient "
                "or update_reorder_threshold as needed."
            )
        update_addon = detect_update_addon_intent(question)
        if update_addon:
            return (
                f"\n\n**Your task (Inventory Agent):** Update add-on **{update_addon}**. "
                "Call query_menu addon_detail, then apply_menu update_addon."
            )
        update_dish = detect_update_dish_intent(question)
        if update_dish or detect_dish_catalog_update_message(question):
            dish_label = update_dish or dish or _infer_locked_dish(state)
            return (
                f"\n\n**Your task (Inventory Agent):** Update existing dish **{dish_label or 'from thread'}**. "
                "Call query_menu search_dishes, preview the change, then apply_menu update_dish "
                "or apply_inventory apply_price_change. Do not consult Creative."
            )
        thread_history = [
            {
                "role": "user" if isinstance(m, HumanMessage) else "assistant",
                "content": str(m.content),
            }
            for m in (state.get("messages") or [])
            if isinstance(m, (HumanMessage, AIMessage)) and m.content
        ]
        if detect_price_adjustment_confirm(question, thread_history):
            dish_label = dish or _infer_locked_dish(state) or "from thread"
            return (
                f"\n\n**Your task (Inventory Agent):** Apply the confirmed sell-price change for **{dish_label}**. "
                "Call apply_inventory apply_price_change with the dish slug and sell_price from the thread. "
                "Do not create a new dish or run plan_recipe_build."
            )
        from tools.core.recipe_build import thread_has_recipe_draft

        if (state.get("confirm_inventory") or state.get("confirm_suggestion")) and (
            recipe_build or (dish and thread_has_recipe_draft(thread_history))
        ):
                return (
                    "\n\n**Your task (Inventory Agent):** Full kitchen catalog build for the locked dish. "
                    "Call apply_menu plan_recipe_build with recipe_ingredients (name, qty, unit), "
                    "recipe_instructions, and visual_brief from Creative, then finalize_recipe_build in this turn. "
                    "finalize_recipe_build adds missing pantry items at qty 0, links them, creates the dish "
                    "with auto-generated images, and creates the recipe. Never ask for photo or store-product picks."
                )
        if dish and detect_add_dish_build_message(state.get("user_question") or ""):
            return (
                "\n\n**Your task (Inventory Agent):** Draft or update the kitchen catalog for the locked dish. "
                "Use apply_menu plan_recipe_build when you have ingredients with qty/unit + steps. "
                "Use apply_inventory create_ingredient for pantry rows at qty 0 (label new). "
                "Search duplicates before any create. Do not finalize until the chef confirms."
            )
        return (
            "\n\n**Your task (Inventory Agent):** Pantry and catalog writes only. "
            "Use apply_inventory / apply_menu after search + preview. "
            "Qty 0 creates are supported (label new)."
        )
    if target == "create":
        if detect_dish_catalog_update_message(state.get("user_question") or ""):
            return (
                "\n\n**Routing correction:** Dish catalog updates go to Inventory only — "
                "use apply_menu update_dish or apply_inventory apply_price_change."
            )
        add_dish = detect_add_dish_intent(state.get("user_question") or "")
        if add_dish or dish:
            return (
                f"\n\n**Your task (Creator Agent):** Draft the recipe, **visual brief**, and **suggested add-ons** "
                f"for **{dish}**. "
                "Include a short **Visual brief:** line (plating, angle, lighting, garnish — 1–3 sentences) "
                "for dish photo generation; Inventory uses it when auto-generating images. "
                "Use query_menu addons to review the catalog — reuse existing modifiers when they fit. "
                "Propose 1–3 add-ons (short name, classification, general ingredient names, optional price) "
                "and a full recipe (ingredients with qty/unit, numbered steps). Read-only — "
                "never ask the chef to pick product photos in chat. "
                "Close with ONE line asking the chef to **confirm** the kitchen build — "
                "do NOT mention Business Agent, margin, sell price, or 'what would you like to do next' "
                "until after Inventory saves."
            )
        return (
            "\n\n**Your task (Creator Agent):** Brainstorm and draft ideas only — you have read tools, "
            "no catalog writes. Sous Chef will consult Inventory to save dishes, add-ons, ingredients, "
            "recipes, or suggestions after the chef confirms."
        )
    if target == "business" and dish:
        price_update = re.search(
            r"(?i)\b(?:update|set|adjust)\s+(?:the\s+)?(?:.+?\s+)?(?:sell\s+)?price\s+to\s+\$?[\d.]+",
            state.get("user_question") or "",
        )
        if price_update:
            return (
                f"\n\n**Your task (Business Agent):** The chef asked to change **{dish}** sell price. "
                "Call query_business dish_pricing for current sell price and food cost. "
                "Report margin at the requested price if asked — but do NOT claim the price was updated. "
                "Tell them Sous Chef will apply the change after they confirm; never recommend "
                "keeping the current price instead of the chef's requested amount."
            )
        return (
            f"\n\n**Your task (Business Agent):** Call query_business suggest_price_change for **{dish}**. "
            "Quote **Sell price (menu)** from the tool — it matches Kitchen control (Dish.sellPrice in DB). "
            "Margin dollars are NOT the sell price. Do not use margins ranking for a single dish."
        )
    if target == "business" and re.search(
        r"\b(margin|price|pricing|sell(?:ing)?\s+price|food\s+cost)\b",
        state.get("user_question") or "",
        re.I,
    ):
        return (
            "\n\n**Your task (Business Agent):** For dish/add-on pricing, call query_business "
            "suggest_price_change, dish_pricing, or addon_pricing with the item name. "
            "For rankings, use margins — each line includes **sell $** and margin $. "
            "Never report margin dollars as the sell price."
        )
    if target == "inventory" and re.search(
        r"\b(on hand|in stock|inventory|quantity|qty|reorder level|reorder threshold)\b",
        state.get("user_question") or "",
        re.I,
    ):
        return (
            "\n\n**Your task (Inventory Agent):** Call query_inventory ingredient_detail or "
            "catalog_search for the item the chef asked about. Quote **On hand** and "
            "**Reorder level** exactly from the DB — same as Kitchen control pantry cards."
        )
    return ""


def run_consult_step(state: ChatState) -> dict[str, Any]:
    targets = state.get("consult_targets") or []
    index = state.get("consult_index") or 0
    if index >= len(targets):
        return {}

    target = targets[index]
    history_rows = [
        {"role": "user" if isinstance(m, HumanMessage) else "assistant", "content": str(m.content)}
        for m in (state.get("messages") or [])
        if isinstance(m, (HumanMessage, AIMessage)) and m.content
    ][:-1]
    core_ctx = CoreToolContext(
        user_id=state.get("user_id") or "",
        upload_batch=state.get("upload_batch"),
        catalog_draft=state.get("catalog_draft"),
        recipe_build=state.get("recipe_build"),
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
        history=history_rows,
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
    results = state.get("consult_results") or {}
    if not results:
        return {}

    reply = format_orchestration_reply(state)
    update: dict[str, Any] = {"messages": [AIMessage(content=reply)], "active_agent": "head"}
    if state.get("pending_action"):
        update["pending_action"] = state["pending_action"]
    if state.get("recipe_build"):
        update["recipe_build"] = state["recipe_build"]
    return update


def run_head_answer(state: ChatState) -> dict[str, Any]:
    core_ctx = CoreToolContext(
        user_id=state.get("user_id") or "",
        upload_batch=state.get("upload_batch"),
        catalog_draft=state.get("catalog_draft"),
        recipe_build=state.get("recipe_build"),
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
    reply = _ensure_next_step(reply, state)
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
        catalog_draft=state.get("catalog_draft"),
        recipe_build=state.get("recipe_build"),
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
    catalog_draft: dict | None = None,
    recipe_build: dict | None = None,
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
    catalog_draft = apply_catalog_draft_correction(catalog_draft, message, history)
    graph = get_supervisor_graph()
    result = graph.invoke(
        {
            "messages": _history_messages(history, message),
            "restaurant_id": restaurant_id,
            "user_id": user_id,
            "upload_batch": upload_batch,
            "catalog_draft": catalog_draft,
            "recipe_build": recipe_build,
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

    consulted = list((result.get("consult_results") or {}).keys())
    return {
        "reply": reply or _fallback("head"),
        "agent_context": "head",
        "handoff": None,
        "suggestion_action": result.get("suggestion_action"),
        "pending_action": result.get("pending_action"),
        "recipe_build": result.get("recipe_build"),
        "activity": {
            "orchestrator": "head",
            "consulted_agents": consulted,
        },
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
