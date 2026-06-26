"""Step graph helpers — branch keys, consult parsing, auto-routing."""

from __future__ import annotations

import re
from copy import deepcopy
from typing import Any

from workflows.engine.types import WorkflowTurn
from workflows.engine.intent import detect_save_confirm, extract_named_entity
from workflows.engine.state import WorkflowState


def find_step(workflow: dict[str, Any], step_id: str) -> dict[str, Any] | None:
    for step in workflow.get("steps") or []:
        if step.get("id") == step_id:
            return step
    return None


def copy_state(state: WorkflowState, **updates: Any) -> WorkflowState:
    data = {
        "workflow_id": state.workflow_id,
        "step_id": state.step_id,
        "locked_name": state.locked_name,
        "gates_passed": list(state.gates_passed),
        "baggage": deepcopy(state.baggage),
    }
    data.update(updates)
    return WorkflowState(**data)


def set_baggage(state: WorkflowState, **pairs: Any) -> WorkflowState:
    baggage = deepcopy(state.baggage)
    baggage.update({k: v for k, v in pairs.items() if v is not None})
    return copy_state(state, baggage=baggage)


def gate_next_step(
    step: dict[str, Any],
    message: str,
    *,
    workflow: dict[str, Any] | None = None,
) -> str | None:
    if not step.get("gate"):
        return None
    gate = str(step.get("gate") or "")
    from workflows.engine.intent import detect_customize, detect_reject_or_edit

    if gate == "disambiguate":
        text = (message or "").strip()
        if text and not detect_reject_or_edit(message):
            if step.get("on_confirm"):
                return str(step["on_confirm"])
            if workflow:
                for consult in workflow.get("steps") or []:
                    if consult.get("on_multiple_matches") == step.get("id"):
                        return str(consult.get("on_complete") or "answer")
            return "answer"
        return None
    if gate == "dish_pick":
        text = (message or "").strip()
        if text and re.fullmatch(r"[123]", text):
            return str(step.get("on_confirm") or "")
        if text and re.search(r"(?:^|\s)(?:#?[123]|option\s*[123])(?:\s|$)", text, re.I):
            return str(step.get("on_confirm") or "")
    if detect_save_confirm(message):
        return str(step.get("on_confirm") or "")
    if detect_customize(message) and step.get("on_customize"):
        return str(step["on_customize"])
    if detect_reject_or_edit(message):
        return str(step.get("on_reject") or step.get("id") or "")
    return None


def consult_text(ctx: WorkflowTurn, worker: str = "inventory") -> str:
    return str(ctx.consult_results.get(worker) or "")


def consult_indicates_duplicate(text: str) -> bool:
    return bool(
        re.search(
            r"\b("
            r"already exists|already in use|duplicate_slug|duplicate slug|"
            r"found matching dish|exact match|strong match|similar to an existing"
            r")\b",
            text,
            re.I,
        )
    )


def consult_missing_ingredients_empty(text: str) -> bool:
    if re.search(r"\bingredient_names_missing:\s*\[\]", text, re.I):
        return True
    if re.search(r"\bno missing ingredients\b", text, re.I):
        return True
    if re.search(r"\ball ingredients matched\b", text, re.I):
        return True
    return False


def consult_persist_success(text: str) -> bool:
    return bool(
        re.search(
            r"\b(created dish|updated dish|updated add-?on|updating add-?on|"
            r"created ingredient|created add-?on|already linked|no change needed|"
            r"linked dishes|finalize_recipe_build|plan_recipe_build|process_purchase_bills|"
            r"process_sales_bills|bills? processed|stock updated|pantry updated)\b",
            text,
            re.I,
        )
    )


def consult_bills_empty(text: str) -> bool:
    return bool(
        re.search(
            r"\b(no purchase bills|no sales bills|no bills in queue|no .*bills are ready|"
            r"no supplier bills|no customer receipts|no recent bills|batch.*empty)\b",
            text,
            re.I,
        )
    )


def consult_prerequisite_blocked(text: str) -> bool:
    return bool(
        re.search(
            r"\b(no processed supplier|process purchase bills in inventory first|"
            r"pantry baselines exist before|po prerequisite.*not met|cannot process sales)\b",
            text,
            re.I,
        )
    )


def consult_multiple_matches(text: str) -> bool:
    return bool(
        re.search(
            r"\b(multiple matches|more than one match|ambiguous|which (?:one|item)|did you mean)\b",
            text,
            re.I,
        )
    )


def resolve_on_success(step: dict[str, Any], state: WorkflowState) -> str:
    on_success = step.get("on_success")
    if isinstance(on_success, dict):
        mode = str(state.baggage.get("invocation_mode") or "standalone")
        return str(on_success.get(mode) or on_success.get("standalone") or "completed")
    return str(on_success or "completed")


def enter_sub_workflow(
    state: WorkflowState,
    parent_step: dict[str, Any],
    *,
    locked_name: str = "",
) -> WorkflowState | None:
    from workflows.engine.loader import get_workflow

    sub_id = str(parent_step.get("sub_workflow") or "").strip()
    if not sub_id:
        return None
    sub_wf = get_workflow(sub_id)
    steps = sub_wf.get("steps") if sub_wf else None
    if not steps:
        return None
    mode = str(parent_step.get("sub_workflow_mode") or "sub_call")
    parent_stack = list(state.baggage.get("parent_stack") or [])
    parent_stack.append(
        {
            "workflow_id": state.workflow_id,
            "step_id": str(parent_step.get("id") or ""),
            "next_step_id": str(parent_step.get("next") or ""),
            "locked_name": locked_name or state.locked_name,
        }
    )
    baggage = deepcopy(state.baggage)
    baggage["invocation_mode"] = mode
    baggage["parent_stack"] = parent_stack
    return WorkflowState(
        workflow_id=sub_id,
        step_id=str(steps[0]["id"]),
        locked_name=locked_name or state.locked_name,
        gates_passed=list(state.gates_passed),
        baggage=baggage,
    )


def resume_parent_workflow(state: WorkflowState) -> WorkflowState | None:
    stack = list(state.baggage.get("parent_stack") or [])
    if not stack:
        return None
    parent = stack[-1]
    baggage = deepcopy(state.baggage)
    baggage["parent_stack"] = stack[:-1]
    if not baggage["parent_stack"]:
        baggage.pop("invocation_mode", None)
    return WorkflowState(
        workflow_id=str(parent["workflow_id"]),
        step_id=str(parent.get("next_step_id") or "confirm_finalize"),
        locked_name=str(parent.get("locked_name") or state.locked_name),
        gates_passed=list(state.gates_passed),
        baggage=baggage,
    )


def goto_step(
    wf: dict[str, Any],
    state: WorkflowState,
    step_id: str,
) -> WorkflowState | None:
    nxt = find_step(wf, step_id)
    if not nxt:
        return state
    if nxt.get("clears_workflow_state"):
        return None
    return copy_state(state, step_id=step_id)


def delegate_worker(step: dict[str, Any]) -> str:
    delegate = step.get("delegate") or []
    if delegate:
        return str(delegate[0])
    tool = str(step.get("tool") or "")
    if tool.startswith("query_business"):
        return "business"
    return "inventory"


def extract_locked_name_from_consult(text: str) -> str:
    for pattern in (
        r"(?im)^###\s+(.+?)\s*$",
        r"(?i)locked[_\s-]?name[:\s]+['\"]?([^'\"\n]+)",
        r"(?i)dish name[:\s]+['\"]?([^'\"\n]+)",
    ):
        match = re.search(pattern, text)
        if match:
            return match.group(1).strip().strip("*")
    return ""


def parse_dish_idea_names(text: str) -> list[str]:
    names: list[str] = []
    for match in re.finditer(r"###\s*\d+\.\s*\*\*([^*]+)\*\*", text or ""):
        name = match.group(1).strip()
        if name:
            names.append(name)
    if names:
        return names
    for match in re.finditer(r"(?im)^\s*\d+\.\s+(.+?)\s*$", text or ""):
        raw = match.group(1).strip().strip("*")
        raw = re.sub(r"^\*\*|\*\*$", "", raw).strip()
        if not raw or raw.lower().startswith("- description"):
            continue
        if raw.lower().startswith("description:"):
            continue
        names.append(raw)
    if names:
        return names
    for match in re.finditer(r"(?im)^###\s+(.+?)\s*$", text or ""):
        name = re.sub(r"^\d+\.\s*", "", match.group(1)).strip().strip("*")
        if name and name.lower() not in ("recipe", "ingredients"):
            names.append(name)
    return names


def resolve_dish_pick_name(message: str, idea_names: list[str]) -> str:
    text = (message or "").strip()
    lower = text.lower()
    if not text:
        return ""
    digit_match = re.search(r"(?:\b|#)(\d)\b", lower)
    if digit_match:
        idx = int(digit_match.group(1)) - 1
        if 0 <= idx < len(idea_names):
            return idea_names[idx]
    if re.search(r"\b1\b|first|option\s*1|#1", lower):
        return idea_names[0] if idea_names else ""
    if re.search(r"\b2\b|second|option\s*2|#2", lower):
        return idea_names[1] if len(idea_names) > 1 else ""
    if re.search(r"\b3\b|third|option\s*3|#3", lower):
        return idea_names[2] if len(idea_names) > 2 else ""
    for name in idea_names:
        if name.lower() in lower:
            return name
    if detect_save_confirm(text):
        return idea_names[0] if idea_names else ""
    return extract_named_entity(text)


def _dish_ideas_from_history(ctx: WorkflowTurn) -> list[str]:
    return collect_dish_ideas_from_context(None, ctx)


def collect_dish_ideas_from_context(
    state: WorkflowState | None,
    ctx: WorkflowTurn,
) -> list[str]:
    """Merge dish idea names from baggage, consult text, and all assistant history."""
    merged: list[str] = []

    def add_names(names: list[str]) -> None:
        for name in names:
            if name and name not in merged:
                merged.append(name)

    if state:
        add_names(list(state.baggage.get("dish_idea_names") or []))
        if len(merged) >= 2:
            return merged
        add_names(parse_dish_idea_names(str(state.baggage.get("dish_ideas_raw") or "")))
        if len(merged) >= 2:
            return merged

    add_names(parse_dish_idea_names(consult_text(ctx, "create")))
    if len(merged) >= 2:
        return merged

    history = getattr(ctx, "history", None) or []
    for row in reversed(history):
        role = getattr(row, "role", None) or (row.get("role") if isinstance(row, dict) else "")
        content = getattr(row, "content", None) or (row.get("content") if isinstance(row, dict) else "")
        if str(role) != "assistant":
            continue
        add_names(parse_dish_idea_names(str(content or "")))
        if len(merged) >= 2:
            return merged

    return merged


def apply_dish_pick(state: WorkflowState, ctx: WorkflowTurn) -> WorkflowState:
    ideas = collect_dish_ideas_from_context(state, ctx)
    picked = resolve_dish_pick_name(ctx.user_message, ideas)
    if picked:
        return set_baggage(copy_state(state, locked_name=picked), dish_idea_names=ideas)
    return state


def detect_intake_mode(ctx: WorkflowTurn, workflow_id: str) -> str:
    msg = (ctx.user_message or "").lower()
    draft = ctx.catalog_draft or {}
    has_image = bool(draft.get("imageUrl") or draft.get("image_url"))
    locked = ctx.workflow_state.locked_name if ctx.workflow_state else ""
    locked = locked or extract_named_entity(ctx.user_message) or str(draft.get("name") or "").strip()

    if re.search(r"\b(ideas?|inspire|suggest|specials?|what should i add)\b", msg) and not locked:
        return "ideas_request"
    if has_image and locked:
        return "name_and_image"
    if has_image:
        return "image_only"
    if locked:
        return "name_only"
    if workflow_id == "add_dish_from_chat" and re.search(r"\b(add|create)\b", msg):
        return "neither"
    return "name_only"


def resolve_branch_key(step: dict[str, Any], state: WorkflowState, ctx: WorkflowTurn) -> str:
    branch = step.get("branch") or {}
    if step.get("id") == "route_intake":
        mode = state.baggage.get("intake_mode") or detect_intake_mode(ctx, state.workflow_id)
        return mode if mode in branch else "default"

    if step.get("id") == "check_recipe_ingredients":
        text = consult_text(ctx)
        if consult_missing_ingredients_empty(text):
            return "ingredient_names_missing_empty"
        return "has_missing"

    if step.get("id") == "duplicate_check":
        if consult_indicates_duplicate(consult_text(ctx)):
            return "on_duplicate"
        return "on_clear"

    if step.get("id") == "route_change_type":
        changes = state.baggage.get("requested_changes") or []
        if isinstance(changes, list) and len(changes) == 1 and changes[0] == "sell_price":
            return "sell_price_only"
        if state.baggage.get("has_classification_change"):
            return "has_classification_change"
        return "default"

    if step.get("id") == "route_post_persist":
        if state.baggage.get("needs_ingredient_link"):
            return "needs_ingredient_link"
        if state.baggage.get("needs_addon_link"):
            return "needs_addon_link"
        return "default"

    return "default"


def should_skip_step(step: dict[str, Any], state: WorkflowState) -> bool:
    skip = step.get("skip_when")
    if not skip:
        return False
    if skip == "ingredient_names_missing_empty":
        return bool(state.baggage.get("ingredient_names_missing_empty"))
    if skip == "invocation_mode_sub_call":
        return state.baggage.get("invocation_mode") == "sub_call"
    if skip in ("no_new_addons_confirmed", "no_addons_confirmed"):
        return not state.baggage.get("has_addons")
    if skip == "no_bills_ready":
        return not state.baggage.get("bills_ready")
    return False


def is_routing_step(step: dict[str, Any]) -> bool:
    if step.get("delegate") or step.get("gate"):
        return False
    if "gate" in step and step.get("gate") is None and step.get("action") and step.get("next"):
        return False
    return bool(step.get("next") or step.get("branch"))


def step_clears_workflow(workflow: dict[str, Any], step: dict[str, Any]) -> bool:
    if step.get("clears_workflow_state"):
        return True
    return workflow.get("mode") == "read" and step.get("id") == "answer"
