"""LLM workflow triage — map chef language to catalog workflow ids."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from config.settings import settings
from domain.context import TurnContext
from workflows.engine.catalog_index import build_catalog_index, list_catalogued_workflow_ids
from workflows.engine.intent import match_workflow_start
from workflows.engine.loader import get_workflow


class TriageDecision(BaseModel):
    action: Literal["start_workflow", "answer_only", "cancel"] = "answer_only"
    workflow_id: str = ""
    locked_name: str = ""
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    reason: str = ""


def should_run_triage(ctx: TurnContext) -> bool:
    """Skip triage when an active workflow already owns the turn."""
    return ctx.workflow_state is None


def run_triage(ctx: TurnContext) -> TriageDecision | None:
    """Pick a workflow from natural language. Returns None when triage is skipped or unavailable."""
    if not should_run_triage(ctx):
        return None
    if not settings.OPENAI_API_KEY:
        return _regex_fallback(ctx)
    try:
        return _llm_triage(ctx)
    except Exception:
        return _regex_fallback(ctx)


def apply_triage(ctx: TurnContext) -> TriageDecision | None:
    """Run triage and attach hints on ctx for the workflow executor."""
    decision = run_triage(ctx)
    if decision is None:
        return None
    ctx.triage_decision = decision
    if decision.action == "cancel":
        ctx.workflow_state = None
        return decision
    if (
        decision.action == "start_workflow"
        and decision.workflow_id
        and decision.confidence >= 0.55
        and get_workflow(decision.workflow_id)
    ):
        ctx.triage_workflow_id = decision.workflow_id
        ctx.triage_locked_name = decision.locked_name.strip()
    return decision


def _regex_fallback(ctx: TurnContext) -> TriageDecision:
    hits = match_workflow_start(
        ctx.user_message,
        ctx.catalog_draft,
        upload_batch=ctx.upload_batch,
    )
    if not hits:
        return TriageDecision(action="answer_only", reason="no regex match")
    wf_id, locked = hits[0]
    return TriageDecision(
        action="start_workflow",
        workflow_id=wf_id,
        locked_name=locked,
        confidence=0.7,
        reason="regex fallback",
    )


def _llm_triage(ctx: TurnContext) -> TriageDecision:
    from langchain_core.messages import HumanMessage, SystemMessage

    from integrations.openai.client import chat_model
    from prompts.builder import build_agent_prompt

    catalog = build_catalog_index()
    valid_ids = sorted(list_catalogued_workflow_ids())
    history_lines = []
    for row in ctx.history[-6:]:
        history_lines.append(f"{row.role}: {row.content[:300]}")
    history_block = "\n".join(history_lines) if history_lines else "(none)"

    system = build_agent_prompt(
        "head",
        chef_name=ctx.chef_name,
        restaurant_name=ctx.restaurant_name,
        data_context="",
        task_prompt="Classify the chef message and pick a workflow when appropriate.",
    )
    system += f"""

## Triage task
You classify the latest chef message against the workflow catalog.
Output structured JSON only via the schema provided.

Rules:
- action=start_workflow when the chef clearly wants a catalogued flow to begin.
- action=answer_only for thanks, greetings, vague chat, or when confidence is low — do not force a workflow.
- action=cancel only when the chef clearly abandons the current topic (never mind, cancel, start over).
- workflow_id MUST be exactly one id from the valid list, or empty for answer_only/cancel.
- locked_name: dish/ingredient/add-on name if the chef stated one; else empty.
- Prefer add_dish_from_chat when chef wants a new menu item without naming it yet.
- link add-on to existing dish → link_addons_to_dish_chat (not link_addons_to_dish)
- add/remove ingredient on existing dish recipe → link_dish_ingredients_chat (not link_dish_ingredients)
- add/remove ingredient on existing add-on recipe → link_addon_ingredients_chat (not link_addon_ingredients)
- "Do we have smoothies/dishes/on the menu" → inventory_menu_lookup (menu catalog). NOT inventory_on_hand unless chef asked on-hand qty for a pantry ingredient.
- "What add-ons do we have / list add-ons" → inventory_menu_lookup (lists add-on catalog from DB).
- Bill uploads/process PO/SO → bills workflows.

Valid workflow ids:
{", ".join(valid_ids)}

Catalog:
{catalog}
"""

    user = f"""Recent history:
{history_block}

Latest chef message:
{ctx.user_message}

upload_batch attached: {bool(ctx.upload_batch)}
catalog_draft attached: {bool(ctx.catalog_draft)}
"""

    model = chat_model(temperature=0).with_structured_output(TriageDecision)
    result: TriageDecision = model.invoke(
        [SystemMessage(content=system), HumanMessage(content=user)]
    )

    if result.workflow_id and result.workflow_id not in valid_ids:
        return TriageDecision(
            action="answer_only",
            confidence=0.0,
            reason=f"invalid workflow_id {result.workflow_id}",
        )
    if result.action == "start_workflow" and not result.workflow_id:
        return TriageDecision(action="answer_only", confidence=0.0, reason="missing workflow_id")
    return result
