"""Reply policy — Sous Chef voice: one question, Ready to save confirm gates."""

from __future__ import annotations

import re

from domain.context import TurnContext
from supervisor.router import RouteDecision
from workflows.engine.loader import get_workflow

CONFIRM_OPTIONS = "(Yes/No/Update Instructions)"
DISH_PICK_OPTIONS = "(Yes/No/Customize)"


def confirm_closer(subject: str, *, to_kitchen: bool = True) -> str:
    label = (subject or "this").strip()
    if to_kitchen:
        return f"Ready to save **{label}** to Kitchen? {CONFIRM_OPTIONS}"
    return f"Ready to apply this change to **{label}**? {CONFIRM_OPTIONS}"


def _step_gate(route: RouteDecision) -> str:
    if not route.workflow_id or not route.step_id:
        return ""
    wf = get_workflow(route.workflow_id)
    if not wf:
        return ""
    for step in wf.get("steps") or []:
        if step.get("id") == route.step_id:
            return str(step.get("gate") or "")
    return ""


def sanitize_reply(reply: str, ctx: TurnContext, route: RouteDecision) -> str:
    """Apply confirm gates and strip stacked questions."""
    text = (reply or "").strip()
    if not text:
        return "What would you like to do next?"

    if route.step_id == "pick_dish" or (route.step_id and _step_gate(route) == "dish_pick"):
        if DISH_PICK_OPTIONS not in text and not re.search(
            r"\b(which|pick|option|1, 2, or 3|1/2/3)\b", text, re.I
        ):
            text = (
                f"{text}\n\nWhich dish — **1**, **2**, or **3**? "
                f"(Yes = option 1, or reply with the name.) {DISH_PICK_OPTIONS}"
            )
    elif route.step_id == "confirm_dish_identity":
        subject = _locked_subject(ctx)
        if CONFIRM_OPTIONS not in text and "look right" not in text.lower():
            text = f"{text}\n\nDoes **{subject}** look right for the menu? {CONFIRM_OPTIONS}"
    elif route.step_id == "confirm_recipe":
        subject = _locked_subject(ctx)
        if CONFIRM_OPTIONS not in text and "look good" not in text.lower():
            text = (
                f"{text}\n\nDoes this recipe look good for **{subject}**? "
                f"Proceed with ingredient linking and kitchen prep? {CONFIRM_OPTIONS}"
            )
    elif route.step_id == "confirm_new_ingredients":
        subject = _locked_subject(ctx)
        if CONFIRM_OPTIONS not in text and "pantry" not in text.lower():
            text = (
                f"{text}\n\nAdd the missing pantry items for **{subject}** at qty 0 "
                f"(label new)? {CONFIRM_OPTIONS}"
            )
    elif route.step_id == "confirm_finalize":
        subject = _locked_subject(ctx)
        if CONFIRM_OPTIONS not in text and "ready to save" not in text.lower():
            text = f"{text}\n\nReady to save **{subject}** to Kitchen now? {CONFIRM_OPTIONS}"
    elif route.step_id and route.step_id.startswith("confirm"):
        subject = _locked_subject(ctx)
        baggage = (ctx.workflow_state.baggage or {}) if ctx.workflow_state else {}
        if route.workflow_id == "link_addons_to_dish_chat" and route.step_id == "confirm_link":
            if CONFIRM_OPTIONS not in text and "Ready to link" not in text:
                addon = str(baggage.get("addon_name") or "").strip()
                dish = subject
                if addon and dish:
                    label = f"**{addon}** to **{dish}**"
                else:
                    label = subject
                text = f"{text}\n\nReady to link {label}? {CONFIRM_OPTIONS}"
        elif route.workflow_id == "link_addon_ingredients_chat" and route.step_id == "confirm_link":
            if CONFIRM_OPTIONS not in text and "Ready to link" not in text:
                ingredient = str(baggage.get("link_ingredient_name") or "").strip()
                addon = subject
                if ingredient and addon:
                    label = f"**{ingredient}** to add-on **{addon}**"
                else:
                    label = subject
                text = f"{text}\n\nReady to link {label}? {CONFIRM_OPTIONS}"
        elif CONFIRM_OPTIONS not in text and "Ready to save" not in text and "Ready to apply" not in text:
            if route.step_id == "confirm_process" and "confirm processing" not in text.lower():
                text = f"{text}\n\nPlease confirm processing these bills. {CONFIRM_OPTIONS}"
            else:
                text = f"{text}\n\n{confirm_closer(subject)}"

    return _collapse_extra_questions(text)


def _locked_subject(ctx: TurnContext) -> str:
    if ctx.workflow_state and ctx.workflow_state.locked_name:
        return ctx.workflow_state.locked_name
    if ctx.catalog_draft:
        name = str(ctx.catalog_draft.get("name") or "").strip()
        if name:
            return name
    return "this item"


def _collapse_extra_questions(text: str) -> str:
    blocks = re.split(r"\n\n+", text)
    ask_idx = [i for i, b in enumerate(blocks) if "?" in b]
    if len(ask_idx) <= 1:
        return text
    keep = ask_idx[-1]
    return "\n\n".join(b for i, b in enumerate(blocks) if i == keep or "?" not in b).strip()
