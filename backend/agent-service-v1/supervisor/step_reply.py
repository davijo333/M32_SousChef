"""Scripted Sous Chef replies for workflow steps without a specialist consult."""

from __future__ import annotations

from domain.context import TurnContext
from supervisor.router import RouteDecision
from workflows.engine.loader import get_workflow


def build_step_reply(ctx: TurnContext, route: RouteDecision) -> str:
    if not route.workflow_id or not route.step_id:
        return ""

    wf = get_workflow(route.workflow_id)
    if not wf:
        return ""

    step = _find_step(wf, route.step_id)
    if not step or step.get("delegate"):
        return ""

    step_id = str(step.get("id") or "")
    locked = (ctx.workflow_state.locked_name if ctx.workflow_state else "") or "this dish"

    scripted = _SCRIPTED.get(step_id)
    if scripted:
        return scripted.format(chef_name=ctx.chef_name, locked_name=locked)

    action = str(step.get("action") or "").strip()
    if action:
        return _action_to_reply(action, locked_name=locked)

    return ""


def _find_step(wf: dict, step_id: str) -> dict | None:
    for step in wf.get("steps") or []:
        if step.get("id") == step_id:
            return step
    return None


def _action_to_reply(action: str, *, locked_name: str) -> str:
    text = action.replace("{locked_name}", locked_name)
    text = " ".join(text.split())
    if not text.endswith("?"):
        text = text.rstrip(".") + "?"
    return text


_SCRIPTED: dict[str, str] = {
    "gather_preferences": (
        "Let's add a new dish to the kitchen. What direction sounds good — "
        "breakfast, lunch, dinner, a beverage, or a cuisine you want to feature?"
    ),
    "confirm_dish_identity": (
        "I'll build **{locked_name}** for the menu — full recipe, pantry links, and images. "
        "Does that name look right?"
    ),
    "stop_warn_chef": (
        "**{locked_name}** is already on the menu. Would you like to update it instead, "
        "or try a different name?"
    ),
}
