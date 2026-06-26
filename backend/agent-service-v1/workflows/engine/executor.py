"""Resolve workflow step for a turn and advance state after consult."""

from __future__ import annotations

import re
from dataclasses import dataclass

from workflows.engine.types import WorkflowTurn
from domain.specialists import SpecialistId
from workflows.engine.intent import (
    detect_save_confirm,
    detect_workflow_cancel,
    extract_named_entity,
    match_workflow_start,
)
from workflows.engine.loader import get_workflow
from workflows.engine.state import WorkflowState
from workflows.engine.transitions import (
    apply_dish_pick,
    consult_bills_empty,
    consult_indicates_duplicate,
    consult_missing_ingredients_empty,
    consult_multiple_matches,
    consult_persist_success,
    consult_prerequisite_blocked,
    consult_text,
    copy_state,
    delegate_worker,
    detect_intake_mode,
    enter_sub_workflow,
    extract_locked_name_from_consult,
    find_step,
    gate_next_step,
    goto_step,
    is_routing_step,
    parse_dish_idea_names,
    resolve_branch_key,
    resolve_on_success,
    resume_parent_workflow,
    set_baggage,
    should_skip_step,
    step_clears_workflow,
)


@dataclass(frozen=True)
class ResolvedStep:
    workflow_id: str
    step_id: str
    delegate: list[SpecialistId] | None
    gate: str | None
    tool: str | None


def resolve_step_for_turn(ctx: WorkflowTurn) -> tuple[ResolvedStep | None, WorkflowState | None]:
    """Match message to workflow or continue active workflow_state."""
    if ctx.workflow_state and detect_workflow_cancel(ctx.user_message):
        return None, None

    if ctx.workflow_state:
        wf = get_workflow(ctx.workflow_state.workflow_id)
        if wf:
            return _resolve_active(ctx, wf, ctx.workflow_state)

    return _resolve_start(ctx)


def advance_after_turn(
    ctx: WorkflowTurn,
    *,
    workflow_id: str | None,
    step_id: str | None,
) -> WorkflowState | None:
    """Move to next step or clear workflow when a step completes."""
    if not workflow_id or not step_id:
        return None

    wf = get_workflow(workflow_id)
    if not wf:
        return None

    step = find_step(wf, step_id)
    if not step:
        return None

    state = ctx.workflow_state or WorkflowState(workflow_id, step_id)
    state.step_id = step_id

    if step.get("gate") and detect_save_confirm(ctx.user_message):
        gate_id = str(step.get("gate") or step["id"])
        if gate_id not in state.gates_passed:
            state.gates_passed.append(gate_id)

    if step.get("delegate"):
        advanced = _advance_after_consult(ctx, wf, state, step)
        if advanced is None:
            return None
        state = advanced
    elif step_clears_workflow(wf, step):
        return None

    if state and find_step(wf, state.step_id) and step_clears_workflow(wf, find_step(wf, state.step_id) or {}):
        return None

    return state


def _resolve_start(ctx: WorkflowTurn) -> tuple[ResolvedStep | None, WorkflowState | None]:
    locked = ""
    candidates = match_workflow_start(
        ctx.user_message,
        ctx.catalog_draft,
        upload_batch=ctx.upload_batch,
    )

    triage_id = getattr(ctx, "triage_workflow_id", None) or ""
    if triage_id and get_workflow(triage_id):
        triage_locked = getattr(ctx, "triage_locked_name", "") or ""
        candidates = [(triage_id, triage_locked or locked)] + [
            row for row in candidates if row[0] != triage_id
        ]

    if not candidates:
        return None, None

    workflow_id, locked_name = candidates[0]
    wf = get_workflow(workflow_id)
    if not wf:
        return None, None

    steps = wf.get("steps") or []
    if not steps:
        return None, None

    state = WorkflowState(workflow_id=workflow_id, step_id=str(steps[0]["id"]))
    if locked_name:
        state.locked_name = locked_name
    state = _prime_intake_baggage(ctx, wf, state)
    state, step = _auto_advance(ctx, wf, state)
    if not step:
        return None, None
    return _to_resolved(workflow_id, step), state


def _resolve_active(
    ctx: WorkflowTurn,
    wf: dict,
    state: WorkflowState,
) -> tuple[ResolvedStep | None, WorkflowState | None]:
    step = find_step(wf, state.step_id)
    if not step:
        return None, None

    if (
        not step.get("delegate")
        and not step.get("gate")
        and step.get("next")
        and (ctx.user_message or "").strip()
        and str(step.get("id") or "") not in ("intake", "ingest_note")
    ):
        state = _capture_action_answer(state, step, ctx)
        state = copy_state(state, step_id=str(step["next"]))
        wf = get_workflow(state.workflow_id) or wf
        step = find_step(wf, state.step_id)
        if not step:
            return None, None

    if step.get("gate"):
        gate_kind = str(step.get("gate") or "")
        if gate_kind == "dish_pick":
            state = apply_dish_pick(state, ctx)
        next_id = gate_next_step(step, ctx.user_message, workflow=wf)
        if gate_kind == "dish_pick":
            if next_id and not state.locked_name:
                next_id = None
            elif not next_id and state.locked_name:
                next_id = str(step.get("on_confirm") or "")
        if next_id:
            state = copy_state(state, step_id=next_id)
            step = find_step(wf, next_id)
            if not step:
                return None, None

    state, step = _auto_advance(ctx, wf, state)
    if not step:
        return None, None

    if step_clears_workflow(wf, step):
        return _to_resolved(state.workflow_id, step), None

    return _to_resolved(state.workflow_id, step), state


def _auto_advance(ctx: WorkflowTurn, wf: dict, state: WorkflowState) -> tuple[WorkflowState, dict | None]:
    visited: set[str] = set()

    while True:
        wf = get_workflow(state.workflow_id) or wf
        step = find_step(wf, state.step_id)
        if not step or step["id"] in visited:
            break
        visited.add(step["id"])

        if should_skip_step(step, state):
            next_id = str(step.get("next") or step.get("on_success") or "")
            if not next_id:
                break
            state = copy_state(state, step_id=next_id)
            continue

        if step.get("id") == "intake":
            state = _prime_intake_baggage(ctx, wf, state)

        if step.get("sub_workflow") and not step.get("delegate"):
            sub_state = enter_sub_workflow(state, step, locked_name=state.locked_name)
            if sub_state:
                state = sub_state
                continue

        if step.get("branch") and not step.get("delegate"):
            key = resolve_branch_key(step, state, ctx)
            branch = step.get("branch") or {}
            next_id = branch.get(key) or branch.get("default")
            if next_id:
                state = _apply_branch_side_effects(state, step, key, ctx)
                state = copy_state(state, step_id=str(next_id))
                continue

        if is_routing_step(step):
            next_id = step.get("next")
            if next_id:
                state = copy_state(state, step_id=str(next_id))
                continue

        break

    wf = get_workflow(state.workflow_id) or wf
    step = find_step(wf, state.step_id)
    return state, step


def _capture_action_answer(state: WorkflowState, step: dict, ctx: WorkflowTurn) -> WorkflowState:
    step_id = str(step.get("id") or "")
    msg = (ctx.user_message or "").strip()
    if step_id == "gather_preferences" and msg:
        return set_baggage(state, chef_constraints=msg, cuisine_hint=msg)
    return state


def _prime_intake_baggage(ctx: WorkflowTurn, wf: dict, state: WorkflowState) -> WorkflowState:
    if wf.get("id") != state.workflow_id:
        return state
    intake_mode = detect_intake_mode(ctx, state.workflow_id)
    state = set_baggage(state, intake_mode=intake_mode)
    batch = ctx.upload_batch
    if batch and state.workflow_id.startswith(("upload_", "process_")):
        from tools.core.bills import upload_batch_bill_type, upload_batch_is_mixed, upload_batch_ready

        ready_ids: list[str] = []
        if isinstance(batch.get("readyBillIds"), list):
            ready_ids = [str(bid) for bid in batch["readyBillIds"] if str(bid).strip()]
        state = set_baggage(
            state,
            upload_batch=batch,
            bills_ready=upload_batch_ready(batch),
            bill_type=upload_batch_bill_type(batch) if not upload_batch_is_mixed(batch) else "mixed",
        )
        if ready_ids:
            state = set_baggage(state, bill_ids=ready_ids)
    return state


def _apply_branch_side_effects(
    state: WorkflowState,
    step: dict,
    key: str,
    ctx: WorkflowTurn,
) -> WorkflowState:
    if step.get("id") == "check_recipe_ingredients":
        return set_baggage(state, ingredient_names_missing_empty=(key == "ingredient_names_missing_empty"))
    if step.get("id") == "duplicate_check":
        if key == "on_duplicate":
            text = consult_text(ctx)
            slug_match = re.search(r"duplicate[_\s-]?slug[:\s]+[`'\"]?([^`'\"\s]+)", text, re.I)
            return set_baggage(
                state,
                duplicate_found=True,
                duplicate_slug=slug_match.group(1) if slug_match else "",
            )
    return state


def _advance_after_consult(ctx: WorkflowTurn, wf: dict, state: WorkflowState, step: dict) -> WorkflowState | None:
    step_id = str(step.get("id") or "")
    worker = delegate_worker(step)
    text = consult_text(ctx, worker)

    if step.get("on_empty") and consult_bills_empty(text):
        return goto_step(wf, state, str(step["on_empty"]))

    if step_id == "lookup" and state.baggage.get("invocation_mode") == "sub_call":
        if consult_indicates_duplicate(text):
            resumed = resume_parent_workflow(
                set_baggage(state, returned_existing_slug=True),
            )
            return resumed
        state.step_id = str(step.get("on_clear") or "confirm_category")
        return state

    if step_id == "duplicate_check":
        if consult_indicates_duplicate(consult_text(ctx)):
            stop = find_step(wf, str(step.get("on_duplicate") or "stop_warn_chef"))
            if stop and stop.get("clears_workflow_state"):
                return None
            state.step_id = str(step.get("on_duplicate") or "stop_warn_chef")
            return state
        state.step_id = str(step.get("on_clear") or "confirm_dish_identity")
        return state

    if step_id == "check_recipe_ingredients":
        text = consult_text(ctx)
        branch = step.get("branch") or {}
        if consult_missing_ingredients_empty(text):
            state = set_baggage(state, ingredient_names_missing_empty=True)
            state.step_id = str(branch.get("ingredient_names_missing_empty") or "confirm_finalize")
        else:
            state = set_baggage(state, ingredient_names_missing_empty=False)
            state.step_id = str(branch.get("has_missing") or "confirm_new_ingredients")
        return state

    if step_id == "draft_recipe":
        create = consult_text(ctx, "create")
        locked = extract_locked_name_from_consult(create) or state.locked_name or extract_named_entity(ctx.user_message)
        if locked:
            state.locked_name = locked
        if create.strip():
            state = set_baggage(state, recipe_draft_raw=create[:8000])
        if "draft_recipe" not in state.gates_passed:
            state.gates_passed.append("draft_recipe")
        state.step_id = str(step.get("on_complete") or "confirm_recipe")
        return state

    if step_id in ("persist_build", "persist", "persist_price", "persist_purchase", "persist_sales", "link_addons_to_dish"):
        if consult_persist_success(text) or step.get("on_success"):
            next_id = resolve_on_success(step, state)
            if next_id == "resume_parent":
                return resume_parent_workflow(state)
            nxt = find_step(wf, next_id)
            if nxt and nxt.get("clears_workflow_state"):
                return None
            state.step_id = next_id
            return state

    if step_id in ("prerequisite",) or (step.get("on_block") and step.get("on_clear")):
        if consult_prerequisite_blocked(text):
            return goto_step(wf, state, str(step.get("on_block") or "stop_po_first"))
        if step.get("on_clear"):
            state.step_id = str(step["on_clear"])
            return state

    if step_id == "lookup" and wf.get("id") == "update_dish":
        if re.search(r"\bnot found\b", consult_text(ctx), re.I):
            stop = find_step(wf, str(step.get("on_missing") or "stop_not_found"))
            if stop and stop.get("clears_workflow_state"):
                return None
        else:
            state.step_id = str(step.get("on_found") or "preview")
        return state

    if step.get("on_multiple_matches") and consult_multiple_matches(text):
        state.step_id = str(step["on_multiple_matches"])
        return state

    if step.get("on_complete"):
        next_id = str(step["on_complete"])
        nxt = find_step(wf, next_id)
        if nxt and step_clears_workflow(wf, nxt):
            return None
        state.step_id = next_id
        return state

    if step.get("next"):
        next_id = str(step["next"])
        if step_id == "suggest_dish_ideas":
            names = parse_dish_idea_names(text)
            state = set_baggage(
                state,
                dish_idea_names=names,
                dish_ideas_raw=text[:4000] if text else "",
            )
        state.step_id = next_id
        return state

    return state


def _to_resolved(workflow_id: str, step: dict) -> ResolvedStep:
    delegate = step.get("delegate")
    return ResolvedStep(
        workflow_id=workflow_id,
        step_id=str(step.get("id") or ""),
        delegate=list(delegate) if delegate else None,
        gate=step.get("gate"),
        tool=step.get("tool"),
    )
