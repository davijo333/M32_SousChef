"""Dispatch consult to the correct specialist agent."""

from __future__ import annotations

from domain.context import TurnContext
from domain.specialists import SpecialistId
from workflows.engine.loader import get_workflow


def run_specialist_consult(
    specialist_id: SpecialistId,
    ctx: TurnContext,
    step_id: str | None,
) -> str:
    """Run one specialist for the current workflow step."""
    from specialists.direct_link import try_direct_link
    from specialists.direct_read import try_direct_read

    direct = try_direct_link(ctx, step_id)
    if direct is not None:
        return direct

    direct = try_direct_read(ctx, step_id)
    if direct is not None:
        return direct

    task_prompt = _build_task_prompt(ctx, step_id)

    if specialist_id == "inventory":
        from specialists.inventory.agent import InventorySpecialist

        return InventorySpecialist().run(ctx, step_id=step_id, task_prompt=task_prompt)
    if specialist_id == "business":
        from specialists.business.agent import BusinessSpecialist

        return BusinessSpecialist().run(ctx, step_id=step_id, task_prompt=task_prompt)
    if specialist_id == "create":
        from specialists.creative.agent import CreativeSpecialist

        return CreativeSpecialist().run(ctx, step_id=step_id, task_prompt=task_prompt)

    return f"(Unknown specialist: {specialist_id})"


def _build_task_prompt(ctx: TurnContext, step_id: str | None) -> str:
    if not ctx.workflow_state:
        return ctx.user_message

    wf = get_workflow(ctx.workflow_state.workflow_id)
    if not wf:
        return ctx.user_message

    baggage = ctx.workflow_state.baggage or {}
    format_vars = {
        "locked_name": ctx.workflow_state.locked_name or "the item",
        "user_message": ctx.user_message,
        "cuisine_hint": baggage.get("cuisine_hint") or "any",
        "meal_type_hint": baggage.get("meal_type_hint") or "any",
        "chef_constraints": baggage.get("chef_constraints") or ctx.user_message,
    }

    for step in wf.get("steps") or []:
        if step.get("id") == (step_id or ctx.workflow_state.step_id):
            template = step.get("task_template") or ""
            if not template:
                return ctx.user_message
            return template.format_map(_SafeFormatMap(format_vars))

    return ctx.user_message


class _SafeFormatMap(dict):
    def __missing__(self, key: str) -> str:
        return ""
