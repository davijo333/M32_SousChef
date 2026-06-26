"""Sous Chef LLM — persona synthesis for chat replies."""

from __future__ import annotations

from config.settings import settings
from domain.context import TurnContext
from supervisor.router import RouteDecision
from supervisor.step_reply import build_step_reply
from workflows.engine.loader import get_workflow


def synthesize_with_llm(ctx: TurnContext, route: RouteDecision) -> str | None:
    """Generate a Sous Chef reply. Returns None when LLM unavailable or fails."""
    if not settings.OPENAI_API_KEY:
        return None
    try:
        return _invoke_synthesize(ctx, route)
    except Exception:
        return None


def _invoke_synthesize(ctx: TurnContext, route: RouteDecision) -> str:
    from langchain_core.messages import HumanMessage, SystemMessage

    from integrations.openai.client import chat_model
    from prompts.builder import build_agent_prompt

    step = _find_step(route.workflow_id, route.step_id) if route.workflow_id else None
    locked = (ctx.workflow_state.locked_name if ctx.workflow_state else "") or "the item"
    step_action = str(step.get("action") or "").strip() if step else ""
    step_tool = str(step.get("tool") or "").strip() if step else ""
    gate = str(step.get("gate") or "") if step else ""

    worker_blocks: list[str] = []
    for worker, text in ctx.consult_results.items():
        body = (text or "").strip()
        if body:
            worker_blocks.append(f"[internal {worker} result]\n{body}")

    system = build_agent_prompt(
        "head",
        chef_name=ctx.chef_name,
        restaurant_name=ctx.restaurant_name,
        data_context=ctx.cues_text,
        task_prompt="Write the next Sous Chef reply for the chef.",
    )
    system += """

## Reply rules (mandatory)
- You are the ONLY voice the chef hears — never mention inventory, business, create, workers, or agents.
- Quote numbers and facts ONLY from worker results below — never invent stock, sales, or catalog changes.
- At most ONE question in the reply during an active workflow step.
- Do not add a confirm gate suffix like (Yes/No) — the system adds that when needed.
- Be concise, kitchen-native, polished. No fluff.
"""
    if route.step_id == "suggest_dish_ideas":
        system += """
## This turn (suggest_dish_ideas)
Present the numbered dish ideas from worker results exactly as options 1–3.
End by asking which dish the chef wants (1, 2, or 3).
Do NOT ask to save to Kitchen, confirm a recipe, or add add-ons yet — picking comes first.
"""
    elif route.step_id == "pick_dish":
        system += """
## This turn (pick_dish)
The chef is choosing among the 2–3 ideas already shown.
Ask which option they want (1, 2, or 3), or accept Yes as option 1.
Do NOT ask to save to Kitchen or confirm a full recipe build yet.
"""
    elif route.step_id == "confirm_dish_identity":
        system += """
## This turn (confirm_dish_identity)
Confirm the dish **name** only — does it look right for the menu?
Do NOT ask to save to Kitchen, add recipes, or process add-ons yet.
"""
    elif route.step_id == "confirm_recipe":
        system += """
## This turn (confirm_recipe)
Present the **full recipe draft** from worker results: ingredients with qty/unit,
numbered prep steps, visual brief, and suggested add-ons.
Ask whether the recipe looks good and if the chef wants to proceed with ingredient linking.
Do NOT ask to save to Kitchen yet — that comes at confirm_finalize after gaps are handled.
"""
    elif route.step_id == "confirm_finalize":
        system += """
## This turn (confirm_finalize)
Summarize the full kitchen build (recipe, ingredient links, images pending).
Ask if the chef is ready to save the dish to Kitchen now.
"""

    triage_note = ""
    if ctx.triage_decision and ctx.triage_decision.action == "answer_only" and not route.workflow_id:
        triage_note = f"Triage note: {ctx.triage_decision.reason or 'general chat'}"

    user = f"""{triage_note}

Active workflow: {route.workflow_id or "(none)"}
Current step: {route.step_id or "(none)"}
Step gate: {gate or "(none)"}
Step tool: {step_tool or "(none)"}
Locked item name: {locked}

Step instruction for you:
{step_action or "(none — use worker results or triage context)"}

Worker results to present (reframe in your voice; do not label as worker output):
{chr(10).join(worker_blocks) if worker_blocks else "(none this turn)"}

Recent history:
{_format_history(ctx)}

Chef just said:
{ctx.user_message}

Write the Sous Chef reply only — no preamble."""

    model = chat_model(temperature=settings.SUPERVISOR_TEMPERATURE)
    response = model.invoke([SystemMessage(content=system), HumanMessage(content=user)])
    text = str(getattr(response, "content", response) or "").strip()
    if not text:
        raise ValueError("empty LLM reply")
    return text


def synthesize_reply(ctx: TurnContext, route: RouteDecision) -> str:
    """Persona reply — LLM first, scripted fallback."""
    llm = synthesize_with_llm(ctx, route)
    if llm:
        return llm

    if ctx.consult_results:
        blocks = [(text or "").strip() for text in ctx.consult_results.values() if (text or "").strip()]
        if blocks:
            return "\n\n".join(blocks)

    scripted = build_step_reply(ctx, route)
    if scripted:
        return scripted

    if ctx.triage_decision and ctx.triage_decision.action == "answer_only":
        return (
            "I can help add menu items, check stock or sales, upload bills, or update the kitchen. "
            "What would you like to do?"
        )

    return "What would you like to do next?"


def _find_step(workflow_id: str | None, step_id: str | None) -> dict | None:
    if not workflow_id or not step_id:
        return None
    wf = get_workflow(workflow_id)
    if not wf:
        return None
    for step in wf.get("steps") or []:
        if step.get("id") == step_id:
            return step
    return None


def _format_history(ctx: TurnContext) -> str:
    lines = []
    for row in ctx.history[-8:]:
        lines.append(f"{row.role}: {row.content[:400]}")
    return "\n".join(lines) if lines else "(none)"
