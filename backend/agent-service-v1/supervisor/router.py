"""Route a turn to workflow + consult targets."""

from __future__ import annotations

from dataclasses import dataclass

from domain.context import TurnContext
from domain.specialists import SpecialistId
from supervisor.triage import apply_triage
from workflows.engine.executor import resolve_step_for_turn


@dataclass(frozen=True)
class RouteDecision:
    workflow_id: str | None
    step_id: str | None
    consult_targets: list[SpecialistId]
    mode: str  # "consult" | "answer" | "handoff"


def resolve_route(ctx: TurnContext) -> RouteDecision:
    """Pick workflow step and specialists for this message."""
    apply_triage(ctx)
    step, wf_state = resolve_step_for_turn(ctx)
    ctx.workflow_state = wf_state
    if step is None:
        return RouteDecision(None, None, [], "answer")

    return RouteDecision(
        workflow_id=step.workflow_id,
        step_id=step.step_id,
        consult_targets=list(step.delegate or []),
        mode="consult" if step.delegate else "answer",
    )
