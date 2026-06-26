"""Creative specialist — read-only brainstorming ReAct agent."""

from __future__ import annotations

from domain.context import TurnContext
from specialists.base import BaseSpecialist
from specialists.react_runner import build_core_ctx, run_react_specialist


class CreativeSpecialist(BaseSpecialist):
    id = "create"  # type: ignore[assignment]

    def run(self, ctx: TurnContext, *, step_id: str | None, task_prompt: str) -> str:
        result = run_react_specialist(
            "create",
            ctx,
            task_prompt=task_prompt,
            core_ctx=build_core_ctx(ctx),
        )
        ctx.consult_side_effects["create"] = {
            "pending_action": result.pending_action,
            "recipe_build": result.recipe_build,
            "navigation_action": result.navigation_action,
        }
        return result.reply
