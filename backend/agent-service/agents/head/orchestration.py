"""Deterministic Sous Chef orchestration — specialists run tools; head reports facts only."""

from __future__ import annotations

import re
from typing import Any

from agents.shared.prompts import ASSISTANT_NAMES
from agents.shared.state import ChatState, SpecialistTarget
from tools.core.catalog_draft_helpers import extract_dish_name_correction_from_thread

MAX_WORKFLOW_CONSULTS = 3


def recent_user_messages(state: ChatState, limit: int = 6) -> list[str]:
    from langchain_core.messages import HumanMessage

    rows: list[str] = []
    for msg in reversed(state.get("messages") or []):
        if isinstance(msg, HumanMessage) and msg.content:
            rows.append(str(msg.content).strip())
        if len(rows) >= limit:
            break
    return list(reversed(rows))


def infer_locked_dish(state: ChatState) -> str:
    recipe_build = state.get("recipe_build") or {}
    recipe_dish = str(recipe_build.get("dishName") or "").strip()
    if recipe_dish:
        return recipe_dish

    candidates = recent_user_messages(state, limit=8)
    corrected = extract_dish_name_correction_from_thread(
        state.get("user_question") or "",
        [{"role": "user", "content": text} for text in candidates],
    )
    if corrected:
        return corrected

    catalog_draft = state.get("catalog_draft") or {}
    catalog_name = str(catalog_draft.get("name") or "").strip()
    catalog_item_type = str(catalog_draft.get("itemType") or "").strip().lower()
    if catalog_name and catalog_item_type == "dish":
        return catalog_name

    patterns = [
        r"(?:recipe for|ingredients for)\s+([a-z][a-z0-9\s\-]{2,60})",
    ]
    for text in reversed(candidates):
        lower = text.lower()
        for pattern in patterns:
            match = re.search(pattern, lower)
            if match:
                phrase = re.sub(r"\b(please|thanks|thank you|now)\b", "", match.group(1)).strip()
                phrase = re.sub(r"\s+", " ", phrase).strip(" .,!?:;")
                if len(phrase.split()) <= 8:
                    return " ".join(word.capitalize() for word in phrase.split())
    return ""


def detect_pantry_add_zero_confirm(message: str) -> bool:
    """Chef wants new pantry rows at qty 0 (not a purchase order)."""
    text = (message or "").strip().lower()
    if not text:
        return False
    has_add = bool(re.search(r"\b(add|create)\b.+\b(ingredient|ingredients|pantry)\b", text))
    has_zero = bool(re.search(r"\b(qty|quantity)\s*0\b", text)) or bool(
        re.search(r"\b(zero|0)\b.+\b(qty|quantity)\b", text)
    )
    return has_add and has_zero


def detect_kitchen_workflow_message(message: str) -> bool:
    text = (message or "").strip().lower()
    if not text:
        return False
    return bool(
        re.search(
            r"\b(recipe|ingredient|dish|menu item|kitchen build|add to (?:kitchen|menu|pantry))\b",
            text,
        )
    )


def detect_addon_workflow_message(message: str) -> bool:
    """Chef wants add-on / modifier suggestions for a dish."""
    text = (message or "").strip().lower()
    if not text:
        return False
    return bool(
        re.search(
            r"\b(add[\s-]?on?s?|modifier|upsell|extras?\s+for|suggest.+add[\s-]?on|what goes with)\b",
            text,
        )
    )


def resolve_workflow_consults(state: ChatState) -> dict[str, Any] | None:
    """Pick specialist consult order before the LLM classifier (write workflows)."""
    message = state.get("user_question") or ""
    catalog = state.get("catalog_draft") or {}
    is_dish = str(catalog.get("itemType") or "").strip().lower() == "dish"
    locked_dish = infer_locked_dish(state)
    confirm = bool(state.get("confirm_suggestion"))
    confirm_inventory = bool(state.get("confirm_inventory"))
    recipe_build = state.get("recipe_build")

    # Full kitchen build confirm — Inventory persists (recipe should be drafted in thread).
    if confirm and (is_dish or locked_dish or recipe_build):
        return _consult_route(["inventory"], confirm_inventory=True)

    # Chef explicitly asked to add pantry placeholders at qty 0 for the active dish.
    if detect_pantry_add_zero_confirm(message) and (is_dish or locked_dish):
        return _consult_route(["inventory"], confirm_inventory=True)

    if detect_pantry_add_zero_confirm(message):
        return _consult_route(["inventory"], confirm_inventory=True)

    # Suggested add-ons for a locked dish — Creative owns pairing logic.
    if locked_dish and detect_addon_workflow_message(message) and not confirm:
        return _consult_route(["create"])

    # Recipe / dish build planning — Creative drafts recipe + suggested add-ons first.
    if (is_dish or locked_dish) and detect_kitchen_workflow_message(message):
        if confirm:
            return _consult_route(["inventory"], confirm_inventory=True)
        return _consult_route(["create"])

    # Post-build margin review — Business reads; Inventory applies price if chef confirms later.
    if locked_dish and re.search(r"\b(margin|cogs|price|pricing|sell price)\b", message.lower()):
        return _consult_route(["business"])

    return None


def format_orchestration_reply(state: ChatState) -> str:
    """Compose Sous Chef reply from specialist tool output — no LLM synthesis."""
    consult_results = state.get("consult_results") or {}
    consulted = list(consult_results.keys())
    pending = state.get("pending_action")
    recipe_build = state.get("recipe_build")

    blocks: list[str] = []

    if consulted:
        names = ", ".join(ASSISTANT_NAMES.get(agent, agent) for agent in consulted)
        blocks.append(f"I consulted the **{names}** and used their tools for this step.")

    for agent, text in consult_results.items():
        label = ASSISTANT_NAMES.get(agent, agent)
        body = (text or "").strip() or "(No response)"
        blocks.append(f"**{label}**\n{body}")

    if pending:
        blocks.append(_pending_summary(pending))

    if recipe_build:
        dish = str(recipe_build.get("dishName") or "dish")
        blocks.append(
            f"**Next:** confirm the recipe and visual brief for **{dish}**, then say **go ahead** "
            "to add ingredients, dish, recipe, and auto-generated photos (no image picking in chat)."
        )

    if not blocks:
        return "What would you like to do next?"

    reply = "\n\n".join(blocks)

    if not pending and not recipe_build:
        locked = infer_locked_dish(state)
        if locked and "business" not in consulted and pending is None:
            reply += (
                f"\n\nWhen **{locked}** is in the kitchen, I can ask the **Business Agent** "
                "for a margin pass and suggest an optimal sell price."
            )
    return reply


def _pending_summary(pending: dict[str, Any]) -> str:
    kind = str(pending.get("kind") or "")
    if kind == "finalize_recipe_build":
        dish = pending.get("dishName") or "the dish"
        return (
            f"**Executing:** build **{dish}** — dish + recipe + pantry ingredients (qty 0, label new) "
            "+ packaging and dish images."
        )
    if kind == "create_ingredient":
        name = pending.get("ingredientName") or "ingredient"
        return f"**Executing:** add pantry item **{name}** at qty **0** (label new)."
    if kind == "create_dish":
        name = pending.get("dishName") or "dish"
        return f"**Executing:** create menu dish **{name}**."
    if kind == "update_dish_price":
        name = pending.get("dishName") or "dish"
        price = pending.get("sellPrice")
        if price is not None:
            return f"**Executing:** update **{name}** sell price to **${float(price):.2f}**."
    if kind == "link_dish_ingredients":
        name = pending.get("dishName") or "dish"
        return f"**Executing:** link ingredients on **{name}**."
    return "**Executing** the confirmed kitchen action."


def _consult_route(
    targets: list[SpecialistTarget],
    *,
    confirm_suggestion: bool | None = None,
    confirm_inventory: bool | None = None,
) -> dict[str, Any]:
    update: dict[str, Any] = {
        "route_mode": "consult",
        "consult_targets": targets[:MAX_WORKFLOW_CONSULTS],
        "consult_index": 0,
        "consult_results": {},
        "active_agent": "head",
    }
    if confirm_suggestion is not None:
        update["confirm_suggestion"] = confirm_suggestion
    if confirm_inventory is not None:
        update["confirm_inventory"] = confirm_inventory
    return update
