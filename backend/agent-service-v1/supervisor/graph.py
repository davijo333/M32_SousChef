"""LangGraph supervisor — triage → route → consult → synthesize."""

from __future__ import annotations

import logging
import re
from typing import Any

from api.schemas.chat import ChatRequest
from domain.context import TurnContext
from supervisor.head_llm import synthesize_reply
from supervisor.reply_policy import sanitize_reply
from supervisor.router import RouteDecision, resolve_route
from specialists.registry import run_specialist_consult
from workflows.engine.executor import advance_after_turn
from workflows.engine.loader import get_workflow
from workflows.engine.transitions import delegate_worker, find_step
from workflows.engine.recipe_draft import recipe_build_from_draft
from workflows.engine.transitions import (
    apply_dish_pick,
    copy_state,
    parse_dish_idea_names,
    set_baggage,
)
from tools.core.catalog_draft_helpers import clean_menu_dish_name

logger = logging.getLogger(__name__)


def _prime_dish_pick_baggage(ctx: TurnContext) -> None:
    state = ctx.workflow_state
    if not state or state.step_id != "pick_dish":
        return
    if state.baggage.get("dish_idea_names"):
        return
    history = getattr(ctx, "history", None) or []
    for row in reversed(history):
        role = getattr(row, "role", row.get("role") if isinstance(row, dict) else "")
        content = getattr(row, "content", row.get("content") if isinstance(row, dict) else "")
        if str(role) != "assistant":
            continue
        names = parse_dish_idea_names(str(content or ""))
        if len(names) >= 2:
            ctx.workflow_state = set_baggage(
                state,
                dish_idea_names=names,
                dish_ideas_raw=str(content or "")[:4000],
            )
            return


def _try_force_dish_pick(ctx: TurnContext) -> bool:
    """Resolve a digit pick (1/2/3) and advance to identity confirm without inventory consult."""
    state = ctx.workflow_state
    if not state or state.workflow_id != "add_dish_from_chat" or state.step_id != "pick_dish":
        return False
    msg = (ctx.user_message or "").strip()
    if not re.fullmatch(r"[123]", msg):
        return False

    _prime_dish_pick_baggage(ctx)
    state = ctx.workflow_state
    if not state:
        return False

    state = apply_dish_pick(state, ctx)
    if not state.locked_name:
        return False

    ctx.workflow_state = copy_state(state, step_id="confirm_dish_identity")
    return True


def _safe_specialist_consult(target: str, ctx: TurnContext, step_id: str | None) -> str:
    try:
        return run_specialist_consult(target, ctx, step_id)
    except Exception:
        logger.exception("Specialist consult failed (%s @ %s)", target, step_id)
        if step_id == "duplicate_check":
            return "clear to proceed — duplicate check unavailable"
        return f"({target} consult unavailable)"


def _persist_dish_ideas_on_pick(state, reply: str):
    if not state or state.step_id != "pick_dish":
        return state
    names = list(state.baggage.get("dish_idea_names") or [])
    if not names:
        names = parse_dish_idea_names(reply)
    if names:
        return set_baggage(
            state,
            dish_idea_names=names,
            dish_ideas_raw=(reply or "")[:4000],
        )
    return state


def _seed_recipe_build(ctx: TurnContext, step_id: str | None) -> None:
    if step_id != "persist_build" or ctx.recipe_build or not ctx.workflow_state:
        return
    draft = ctx.workflow_state.baggage.get("recipe_draft_raw")
    if not draft:
        return
    locked = clean_menu_dish_name(ctx.workflow_state.locked_name or "")
    raw_plan = recipe_build_from_draft(str(draft), locked)
    if not raw_plan:
        return
    try:
        from tools.core.recipe_build import plan_recipe_build

        ctx.recipe_build = plan_recipe_build(
            ctx.restaurant_id,
            None,
            dish_name=str(raw_plan.get("dishName") or locked or ""),
            description=str(raw_plan.get("description") or ""),
            visual_brief=str(raw_plan.get("visualBrief") or ""),
            classification=str(raw_plan.get("classification") or "other"),
            sell_price=raw_plan.get("sellPrice"),
            ingredients=[
                {
                    "name": row.get("name"),
                    "qty": row.get("qty"),
                    "unit": row.get("unit"),
                }
                for row in (raw_plan.get("ingredients") or [])
            ],
            instructions=list(raw_plan.get("instructions") or []),
        )
        if locked:
            ctx.recipe_build["dishName"] = locked
    except ValueError:
        ctx.recipe_build = raw_plan
        if locked:
            ctx.recipe_build["dishName"] = locked


def _chain_direct_delegate_consults(ctx: TurnContext, route: RouteDecision) -> None:
    """Run chained direct delegate steps on the same turn (lookup → pantry check)."""
    wf = get_workflow(route.workflow_id or "")
    if not wf or not wf.get("direct_delegate") or not ctx.workflow_state:
        return

    hops = 0
    while hops < 6:
        step = find_step(wf, ctx.workflow_state.step_id)
        if not step or not step.get("delegate"):
            break
        worker = delegate_worker(step)
        ctx.consult_results[worker] = _safe_specialist_consult(worker, ctx, ctx.workflow_state.step_id)
        advanced = advance_after_turn(
            ctx,
            workflow_id=ctx.workflow_state.workflow_id,
            step_id=ctx.workflow_state.step_id,
        )
        if not advanced or advanced.step_id == ctx.workflow_state.step_id:
            break
        ctx.workflow_state = advanced
        wf = get_workflow(advanced.workflow_id) or wf
        hops += 1


def run_supervisor_turn(req: ChatRequest) -> dict[str, Any]:
    """Single chat turn entrypoint."""
    ctx = TurnContext.from_request(req)
    _prime_dish_pick_baggage(ctx)

    forced_pick = _try_force_dish_pick(ctx)
    if forced_pick:
        route = RouteDecision("add_dish_from_chat", "confirm_dish_identity", [], "answer")
    else:
        route = resolve_route(ctx)

    _seed_recipe_build(ctx, route.step_id)

    if not forced_pick and route.consult_targets:
        for target in route.consult_targets:
            ctx.consult_results[target] = _safe_specialist_consult(target, ctx, route.step_id)

    if forced_pick:
        next_wf = ctx.workflow_state
    else:
        next_wf = advance_after_turn(
            ctx,
            workflow_id=route.workflow_id,
            step_id=route.step_id,
        )
        if next_wf:
            ctx.workflow_state = next_wf
            _chain_direct_delegate_consults(ctx, route)
            next_wf = ctx.workflow_state

    reply_step_id = next_wf.step_id if next_wf else route.step_id
    if (
        reply_step_id == "confirm_recipe"
        and ctx.workflow_state
        and not ctx.consult_results.get("create")
    ):
        draft = ctx.workflow_state.baggage.get("recipe_draft_raw")
        if draft:
            ctx.consult_results["create"] = str(draft)

    reply_route = RouteDecision(
        route.workflow_id,
        reply_step_id,
        [],
        route.mode,
    )
    reply = synthesize_reply(ctx, reply_route)
    reply = sanitize_reply(reply, ctx, reply_route)

    if next_wf and next_wf.step_id == "pick_dish":
        next_wf = _persist_dish_ideas_on_pick(next_wf, reply)

    pending_action = None
    recipe_build = ctx.recipe_build
    navigation_action = None
    for effects in ctx.consult_side_effects.values():
        if effects.get("pending_action"):
            pending_action = effects["pending_action"]
        if effects.get("recipe_build"):
            recipe_build = effects["recipe_build"]
        if effects.get("navigation_action"):
            navigation_action = effects["navigation_action"]

    return {
        "reply": reply,
        "agent_context": "head",
        "workflow_state": next_wf.to_dict() if next_wf else None,
        "recipe_build": recipe_build,
        "pending_action": pending_action,
        "navigation_action": navigation_action,
        "activity": {
            "orchestrator": "head",
            "consulted_agents": [],
            "internal_consulted": list(ctx.consult_results.keys()),
            "workflow_id": route.workflow_id,
            "step_id": reply_step_id,
            "triage": (
                {
                    "action": ctx.triage_decision.action,
                    "workflow_id": ctx.triage_decision.workflow_id,
                    "confidence": ctx.triage_decision.confidence,
                }
                if ctx.triage_decision
                else None
            ),
        },
    }


def build_supervisor_graph():
    """TODO: LangGraph StateGraph when async/streaming is needed."""
    raise NotImplementedError("Use run_supervisor_turn for v1 bootstrap")
