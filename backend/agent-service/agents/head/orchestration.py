"""Deterministic Sous Chef orchestration — specialists run tools; head reports facts only."""

from __future__ import annotations

import re
from typing import Any

from agents.shared.prompts import ASSISTANT_NAMES
from agents.shared.state import ChatState, SpecialistTarget
from tools.core.catalog_draft_helpers import extract_dish_name_correction_from_thread
from tools.core.recipe_build import (
    extract_dish_name_from_history,
    thread_has_kitchen_build_in_thread,
    thread_has_recipe_draft,
)

COMPLEX_ADDON_HINTS = (
    "guacamole",
    "salsa",
    "aioli",
    "dressing",
    "reduction",
    "compote",
    "marinade",
    "mousse",
    "coulis",
    "pesto",
    "chutney",
    "relish",
    "vinaigrette",
)

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


def _extract_dish_from_pricing_question(message: str) -> str:
    """Pull a dish name from read-only price / margin questions."""
    text = (message or "").strip()
    if not text:
        return ""
    if re.search(
        r"\b(?:update|set|adjust)\s+(?:the\s+)?(?:margin|sell\s+price|price)\s+to\b",
        text,
        re.I,
    ):
        return ""
    patterns = [
        r"(?i)(?:what(?:'s| is)|how much|tell me).+(?:sell(?:ing)?\s+price|price|margin).+(?:for|on|of)\s+(?:my\s+)?([A-Za-z][A-Za-z0-9\s'-]{2,50})",
        r"(?i)(?:sell(?:ing)?\s+price|margin|price).+(?:for|on|of)\s+(?:my\s+)?([A-Za-z][A-Za-z0-9\s'-]{2,50})",
        r"(?i)(?:my\s+)?([A-Za-z][A-Za-z0-9\s'-]{2,50}).+(?:sell(?:ing)?\s+price|margin)\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        name = re.sub(r"\*+", "", match.group(1)).strip(" .,!?:;?")
        if name and len(name.split()) <= 8:
            return name
    return ""


def infer_locked_dish(state: ChatState) -> str:
    recipe_build = state.get("recipe_build") or {}
    recipe_dish = str(recipe_build.get("dishName") or "").strip()
    if recipe_dish:
        return recipe_dish

    thread = _thread_history_from_state(state)
    from_thread = extract_dish_name_from_history(thread)
    if from_thread:
        return from_thread

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
        r"\b(?:add|create)\s+(?:a\s+)?dish\s+([a-z][a-z0-9\s\-]{2,60})",
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

    pricing_dish = _extract_dish_from_pricing_question(state.get("user_question") or "")
    if pricing_dish:
        return pricing_dish
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
    """In-progress kitchen build language — prefer detect_add_dish_intent for new dish adds."""
    return detect_add_dish_build_message(message)


def detect_add_dish_intent(message: str) -> str:
    """New menu dish / recipe build — consult Creative first. Returns dish name when parseable."""
    text = (message or "").strip()
    if not text:
        return ""
    if detect_dish_catalog_update_message(text):
        return ""
    if detect_add_ingredient_intent(text) or detect_add_addon_intent(text):
        return ""
    if detect_pantry_add_zero_confirm(text):
        return ""

    patterns = [
        r"(?i)(?:let'?s\s+)?(?:add|create|build)\s+(?:a\s+)?(?:new\s+)?(?:menu\s+)?dish\s+['\"]?([^'\".\n?]+?)['\"]?(?:\s+to\s+(?:the\s+)?(?:menu|kitchen))?(?:[.?!\n]|$)",
        r"(?i)(?:let'?s\s+)?(?:add|create)\s+(?:a\s+)?(?:new\s+)?menu\s+item\s+['\"]?([^'\".\n?]+?)['\"]?",
        r"(?i)build\s+(?:a\s+)?recipe\s+for\s+(?:the\s+)?['\"]?([^'\".\n?]+?)['\"]?",
        r"(?i)(?:add|create)\s+['\"]([^'\"]+)['\"]\s+to\s+(?:the\s+)?(?:menu|kitchen)",
        r"(?i)(?:add|create)\s+(.+?)\s+to\s+(?:the\s+)?(?:menu|kitchen)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        name = re.sub(r"\*+", "", match.group(1)).strip().strip("'\"")
        if not name or len(name.split()) > 8:
            continue
        if name.lower() in ("the", "my", "a", "an", "new"):
            continue
        return name
    return ""


def detect_add_dish_build_message(message: str) -> bool:
    """Kitchen build thread signals (recipe draft, link ingredients) — not catalog updates."""
    text = (message or "").strip().lower()
    if not text:
        return False
    if detect_dish_catalog_update_message(message):
        return False
    if detect_add_ingredient_intent(message):
        return False
    if detect_add_simple_addon_intent(message):
        return False
    if detect_add_dish_intent(message):
        return True
    return bool(
        re.search(
            r"\b(recipe|dish|menu item|kitchen build|add to (?:kitchen|menu))\b",
            text,
        )
        or (
            re.search(r"\bingredient\b", text)
            and re.search(r"\b(recipe|dish|link)\b", text)
        )
    )


def is_simple_addon_name(name: str) -> bool:
    lower = name.strip().lower()
    if not lower or len(lower) > 48:
        return False
    if any(hint in lower for hint in COMPLEX_ADDON_HINTS):
        return False
    return len(lower.split()) <= 4


def detect_add_ingredient_intent(message: str) -> str:
    text = (message or "").strip()
    if not text:
        return ""
    if re.search(r"\b(recipe|menu item|dish)\b", text, re.I):
        return ""
    if re.search(r"\bto\s+(?:the\s+)?(?:dish|recipe)\b", text, re.I):
        return ""
    patterns = [
        r"(?i)(?:let'?s\s+)?(?:add|create)\s+(?:an?\s+)?ingredient\s+['\"]([^'\"]+)['\"]",
        r"(?i)(?:let'?s\s+)?(?:add|create)\s+(?:an?\s+)?ingredient\s+([A-Za-z][A-Za-z0-9\s'-]{1,40})\s*\.?$",
        r"(?i)add\s+['\"]([^'\"]+)['\"]\s+to\s+(?:the\s+)?pantry",
        r"(?i)add\s+([A-Za-z][A-Za-z0-9\s'-]{1,40})\s+to\s+(?:the\s+)?pantry",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        name = match.group(1).strip()
        if name and len(name.split()) <= 6:
            return name
    return ""


def detect_add_addon_intent(message: str) -> str:
    """Any direct add-on create — Inventory only (no Creative)."""
    text = (message or "").strip()
    if not text:
        return ""
    if re.search(r"\bsuggest\b.+\badd[\s-]?on", text, re.I):
        return ""
    if re.search(r"\badd[\s-]?on?s?\s+for\b", text, re.I):
        return ""
    patterns = [
        r"(?i)(?:add|create)\s+(?:an?\s+)?add[\s-]?on\s+['\"]([^'\"]+)['\"]",
        r"(?i)(?:add|create)\s+['\"]([^'\"]+)['\"]\s+as\s+(?:an?\s+)?add[\s-]?on",
        r"(?i)add\s+['\"]([^'\"]+)['\"]\s+as\s+(?:an?\s+)?add[\s-]?on",
        r"(?i)(?:add|create)\s+(?:an?\s+)?add[\s-]?on\s+([A-Za-z][A-Za-z0-9\s'-]{1,48})",
        r"(?i)add\s+([A-Za-z][A-Za-z0-9\s'-]{1,48})\s+as\s+(?:an?\s+)?add[\s-]?on",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        name = match.group(1).strip()
        if name and len(name.split()) <= 8:
            return name
    return ""


def detect_add_simple_addon_intent(message: str) -> str:
    return detect_add_addon_intent(message)


def detect_update_ingredient_intent(message: str) -> str:
    text = (message or "").strip()
    if not text:
        return ""
    patterns = [
        r"(?i)\bupdate\s+(?:the\s+)?ingredient\s+['\"]([^'\"]+)['\"]",
        r"(?i)\bupdate\s+['\"]([^'\"]+)['\"]\s+in\s+(?:the\s+)?pantry",
        r"(?i)\b(?:update|set|adjust)\s+(?:the\s+)?reorder(?:\s+level|\s+threshold)?\s+(?:of|for|on)\s+['\"]([^'\"]+)['\"]",
        r"(?i)\b(?:update|set|adjust)\s+(?:the\s+)?reorder(?:\s+level|\s+threshold)?\s+(?:of|for|on)\s+([A-Za-z][A-Za-z0-9\s'-]{2,50}?)\s+to\b",
        r"(?i)\bchange\s+(?:the\s+)?(?:reorder|qty|quantity)\s+(?:for|on|of)\s+['\"]?([^'\".\n]+?)['\"]?\s*$",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            name = match.group(1).strip()
            if name:
                return name
    return ""


def detect_update_addon_intent(message: str) -> str:
    text = (message or "").strip()
    if not text:
        return ""
    patterns = [
        r"(?i)\bupdate\s+(?:the\s+)?add[\s-]?on\s+['\"]([^'\"]+)['\"]",
        r"(?i)\bupdate\s+['\"]([^'\"]+)['\"]\s+add[\s-]?on",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            name = match.group(1).strip()
            if name:
                return name
    return ""


def detect_update_dish_intent(message: str) -> str:
    """Extract dish name from an update-existing-dish request (catalog writes — Inventory only)."""
    text = (message or "").strip()
    if not text:
        return ""
    if detect_add_ingredient_intent(message) or detect_add_addon_intent(message):
        return ""
    if re.search(r"(?i)\badd[\s-]?on\b", text):
        return ""

    if detect_price_update_request(text):
        selling_of = re.search(
            r"(?i)\b(?:update|set|adjust)\s+(?:the\s+)?sell(?:ing)?\s+price\s+(?:of|for)\s+(.+?)\s+to\s+",
            text,
        )
        if selling_of:
            name = selling_of.group(1).strip().strip("'\"")
            if name and name.lower() not in ("selling", "sell", "the"):
                return name
        dish_price = re.search(
            r"(?i)\b(?:update|set|adjust)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9\s'-]{2,50}?)\s+(?:sell\s+)?price\s+to\s+",
            text,
        )
        if dish_price:
            name = dish_price.group(1).strip()
            if name.lower() not in ("selling", "sell", "the"):
                return name
        return ""

    patterns = [
        r"(?i)\bupdate\s+(?:the\s+)?dish\s+['\"]([^'\"]+)['\"]",
        r"(?i)\bupdate\s+['\"]([^'\"]+)['\"]\s+(?:on|in)\s+(?:the\s+)?(?:menu|kitchen)",
        r"(?i)\b(?:change|update)\s+(?:the\s+)?(?:dish\s+)?(?:name|description|classification)\s+(?:for|of|on)\s+(.+?)(?:\s+to\b|[.?!\n]|$)",
        r"(?i)\brename\s+(?:the\s+)?(?:dish\s+)?['\"]?([^'\".\n]+?)['\"]?\s+to\b",
        r"(?i)\bupdate\s+['\"]([^'\"]+)['\"]\s+dish\b",
        r"(?i)\bupdate\s+(.+?)\s+dish\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        name = match.group(1).strip().strip("'\"")
        if name and len(name.split()) <= 8:
            return name
    return ""


def detect_dish_catalog_update_message(message: str) -> bool:
    """True when chef is changing an existing dish field — route Inventory only, never Creative."""
    text = (message or "").strip()
    if not text:
        return False
    if detect_price_update_request(text):
        return True
    if detect_update_dish_intent(text):
        return True
    return bool(
        re.search(
            r"(?i)\b(?:update|change|set|adjust|rename)\b.+\b(?:description|classification|name|sell(?:ing)?\s+price|price|margin)\b",
            text,
        )
        or re.search(r"(?i)\b(?:update|change|rename)\s+(?:the\s+)?(?:dish|menu item)\b", text)
    )


def thread_awaiting_kitchen_save_confirm(history: list[dict[str, str]]) -> bool:
    if thread_has_kitchen_build_in_thread(history):
        return False
    last_assistant = ""
    for row in reversed(history):
        if row.get("role") == "assistant" and row.get("content"):
            last_assistant = str(row["content"])
            break
    if not last_assistant:
        return False
    asks = re.search(
        r"\b(please confirm|would you like to proceed|confirm if you(?:'d| would) like|ready to (?:add|save)|save (?:it|this) to (?:your )?kitchen)\b",
        last_assistant,
        re.I,
    )
    if not asks:
        return False
    all_text = "\n".join(str(row.get("content") or "") for row in history)
    has_dish = bool(extract_dish_name_from_history(history)) or bool(
        re.search(
            r"(?:menu name|proposed dish|pos description|visual brief|suggested add-?ons?)",
            all_text,
            re.I,
        )
    )
    return has_dish


def detect_save_confirm(message: str) -> bool:
    """Chef wants to persist a drafted recipe from chat."""
    text = (message or "").strip().lower()
    if not text:
        return False
    return bool(
        re.search(
            r"\b(yes|confirm|go ahead|proceed|save(?:\s+it)?|do it|approved?|sure)\b",
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


def _thread_history_from_state(state: ChatState) -> list[dict[str, str]]:
    from langchain_core.messages import AIMessage, HumanMessage

    rows: list[dict[str, str]] = []
    for msg in state.get("messages") or []:
        if isinstance(msg, HumanMessage) and msg.content:
            rows.append({"role": "user", "content": str(msg.content)})
        elif isinstance(msg, AIMessage) and msg.content:
            rows.append({"role": "assistant", "content": str(msg.content)})
    return rows


def detect_price_update_request(message: str) -> bool:
    return bool(
        re.search(
            r"(?i)\b(?:update|set|adjust)\s+(?:the\s+)?(?:sell(?:ing)?\s+price(?:\s+(?:of|for)\s+.+?)?|.+?\s+price)\s+to\s+\$?[\d.]+",
            message or "",
        )
    )


def detect_price_adjustment_confirm(message: str, history: list[dict[str, str]]) -> bool:
    if not detect_save_confirm(message):
        return False
    if thread_awaiting_kitchen_save_confirm(history):
        return False
    if re.search(
        r"(?i)\b(?:update|set|adjust|change)\s+(?:the\s+)?(?:reorder(?:\s+level|\s+threshold)?|quantity|qty|on[- ]?hand)\b",
        message or "",
    ):
        return False

    preview_index = -1
    applied_index = -1
    for idx, row in enumerate(history):
        if row.get("role") != "assistant":
            continue
        text = str(row.get("content") or "")
        if re.search(r"\bUpdated \*\*[^*]+\*\* sell price to \$?[\d.]+\.?", text, re.I):
            applied_index = idx
        if re.search(r"\bUpdate(?: pantry ingredient)?\s+(?:\*\*[^*]+\*\*|.+)\s+reorder level to\b", text, re.I):
            continue
        if re.search(
            r"\b(recommended sell price|set this price|apply the change|sell price would be|margin adjustment|Update \*\*[^*]+\*\* sell price to)\b",
            text,
            re.I,
        ) or re.search(
            r"\b(?:proceed with the price change|confirm if you(?:'d| would) like to proceed|maintain the current price)\b",
            text,
            re.I,
        ):
            preview_index = idx

    if preview_index < 0:
        return False
    if applied_index > preview_index:
        return False

    for row in history[preview_index + 1 :]:
        if row.get("role") != "user":
            continue
        text = str(row.get("content") or "").strip()
        if not text:
            continue
        if detect_save_confirm(text) and not re.search(
            r"(?i)\b(?:update|set|adjust|change)\s+(?:the\s+)?(?:reorder(?:\s+level|\s+threshold)?|quantity|qty|on[- ]?hand)\b",
            text,
        ):
            continue
        if re.search(
            r"(?i)\b(?:update|set|adjust|change)\s+(?:the\s+)?(?:reorder(?:\s+level|\s+threshold)?|quantity|qty|on[- ]?hand)\b",
            text,
        ):
            return False
        if detect_price_update_request(text):
            return False

    return True


def detect_reorder_threshold_confirm(message: str, history: list[dict[str, str]]) -> bool:
    if not detect_save_confirm(message):
        return False
    if thread_awaiting_kitchen_save_confirm(history) and not _thread_awaiting_reorder_confirm(history):
        return False
    if re.search(
        r"(?i)\b(?:update|set|adjust|change)\s+(?:the\s+)?reorder(?:\s+level|\s+threshold)?\b",
        message or "",
    ):
        return False
    return _thread_awaiting_reorder_confirm(history)


def _is_reorder_preview_message(text: str) -> bool:
    if re.search(r"\bUpdate \*\*[^*]+\*\* sell price to\b", text, re.I):
        return False
    return bool(
        re.search(r"\bUpdate(?: pantry ingredient)? \*\*[^*]+\*\* reorder level to\b", text, re.I)
        or re.search(
            r"\bUpdate(?: pantry ingredient)?\s+(?:\*\*[^*]+\*\*|.+)\s+reorder level to\s+[\d.]+\b",
            text,
            re.I,
        )
    )


def _thread_awaiting_reorder_confirm(history: list[dict[str, str]]) -> bool:
    preview_index = -1
    applied_index = -1
    for idx, row in enumerate(history):
        if row.get("role") != "assistant":
            continue
        text = str(row.get("content") or "")
        if re.search(r"\bUpdated \*\*[^*]+\*\* reorder (?:level|threshold) to [\d.]+\.?", text, re.I):
            applied_index = idx
        if _is_reorder_preview_message(text):
            preview_index = idx

    if preview_index < 0:
        return False
    if applied_index > preview_index:
        return False

    for row in history[preview_index + 1 :]:
        if row.get("role") != "user":
            continue
        text = str(row.get("content") or "").strip()
        if not text:
            continue
        if detect_save_confirm(text):
            continue
        if re.search(
            r"(?i)\b(?:update|set|adjust|change)\s+(?:the\s+)?reorder(?:\s+level|\s+threshold)?\b",
            text,
        ):
            return False

    return True


def resolve_workflow_consults(state: ChatState) -> dict[str, Any] | None:
    """Pick specialist consult order before the LLM classifier (write workflows)."""
    message = state.get("user_question") or ""
    catalog = state.get("catalog_draft") or {}
    is_dish = str(catalog.get("itemType") or "").strip().lower() == "dish"
    locked_dish = infer_locked_dish(state)
    confirm = bool(state.get("confirm_suggestion")) or bool(state.get("confirm_inventory"))
    recipe_build = state.get("recipe_build")
    thread_history = _thread_history_from_state(state)
    kitchen_built = thread_has_kitchen_build_in_thread(thread_history)
    has_thread_recipe = thread_has_recipe_draft(thread_history)
    awaiting_save = thread_awaiting_kitchen_save_confirm(thread_history)

    is_addon = str(catalog.get("itemType") or "").strip().lower() == "addon"
    is_ingredient = str(catalog.get("itemType") or "").strip().lower() == "ingredient"

    ingredient_name = detect_add_ingredient_intent(message)
    if ingredient_name or is_ingredient:
        if detect_save_confirm(message):
            return _consult_route(["inventory"], confirm_inventory=True)
        return _consult_route(["inventory"])

    addon_name = detect_add_addon_intent(message)
    if addon_name or is_addon:
        if detect_save_confirm(message):
            return _consult_route(["inventory"], confirm_inventory=True)
        return _consult_route(["inventory"])

    update_ing = detect_update_ingredient_intent(message)
    if update_ing:
        return _consult_route(["inventory"], confirm_inventory=detect_save_confirm(message))

    update_addon = detect_update_addon_intent(message)
    if update_addon:
        return _consult_route(["inventory"], confirm_inventory=detect_save_confirm(message))

    if detect_dish_catalog_update_message(message):
        return _consult_route(
            ["inventory"],
            confirm_inventory=(
                detect_save_confirm(message)
                or detect_price_adjustment_confirm(message, thread_history)
            ),
        )

    if detect_price_update_request(message):
        if detect_price_adjustment_confirm(message, thread_history):
            return _consult_route(["inventory"], confirm_inventory=True)
        return {
            "route_mode": "answer",
            "consult_targets": [],
            "active_agent": "head",
        }

    if re.search(
        r"(?i)\b(?:update|set|adjust|change)\s+(?:the\s+)?reorder(?:\s+level|\s+threshold)?\b",
        message,
    ):
        if detect_reorder_threshold_confirm(message, thread_history):
            return _consult_route(["inventory"], confirm_inventory=True)
        return _consult_route(["inventory"])

    if detect_reorder_threshold_confirm(message, thread_history):
        return _consult_route(["inventory"], confirm_inventory=True)

    if (kitchen_built or locked_dish) and detect_price_adjustment_confirm(message, thread_history):
        return _consult_route(["inventory"], confirm_inventory=True)

    # Full kitchen build confirm — Inventory persists (recipe should be drafted in thread).
    if (
        confirm
        and (is_dish or locked_dish or recipe_build or has_thread_recipe)
        and not kitchen_built
        and not detect_price_adjustment_confirm(message, thread_history)
    ):
        return _consult_route(["inventory"], confirm_inventory=True)

    if detect_save_confirm(message) and (
        locked_dish or has_thread_recipe or awaiting_save
    ) and not kitchen_built and not detect_price_adjustment_confirm(message, thread_history):
        return _consult_route(["inventory"], confirm_inventory=True)

    # Chef explicitly asked to add pantry placeholders at qty 0 for the active dish.
    if detect_pantry_add_zero_confirm(message) and (is_dish or locked_dish):
        return _consult_route(["inventory"], confirm_inventory=True)

    if detect_pantry_add_zero_confirm(message):
        return _consult_route(["inventory"], confirm_inventory=True)

    # New dish / recipe build — Creative drafts first; Inventory persists on confirm.
    add_dish = detect_add_dish_intent(message)
    if (
        add_dish
        or (is_dish and detect_add_dish_build_message(message))
        or (has_thread_recipe and detect_add_dish_build_message(message) and not kitchen_built)
    ):
        if confirm:
            return _consult_route(["inventory"], confirm_inventory=True)
        return _consult_route(["create"])

    # Dish / add-on pricing — Business reads DB sell price.
    pricing_dish = locked_dish or _extract_dish_from_pricing_question(message)
    if pricing_dish and re.search(
        r"\b(margin|cogs|price|pricing|sell(?:ing)?\s+price|food\s+cost)\b",
        message.lower(),
    ):
        if not re.search(
            r"\b(?:update|set|adjust)\s+(?:the\s+)?(?:.+?\s+)?(?:sell\s+)?price\s+to\b",
            message.lower(),
        ):
            return _consult_route(["business"])
    if re.search(r"\badd[\s-]?on\b", message.lower()) and re.search(
        r"\b(margin|price|pricing|sell(?:ing)?\s+price)\b",
        message.lower(),
    ):
        if not re.search(
            r"\b(?:update|set|adjust)\s+(?:the\s+)?(?:margin|sell\s+price|price)\s+to\b",
            message.lower(),
        ):
            return _consult_route(["business"])

    # Pantry stock / reorder — Inventory reads DB qty and reorder threshold.
    if re.search(
        r"\b(on hand|in stock|inventory|quantity|qty|reorder level|reorder threshold)\b",
        message.lower(),
    ):
        if re.search(
            r"\b(?:update|set|adjust)\s+(?:the\s+)?(?:reorder(?:\s+level|\s+threshold)?|quantity|qty)\s+(?:of|for|on)\b",
            message.lower(),
        ):
            return _consult_route(["inventory"], confirm_inventory=detect_save_confirm(message))
        item = _extract_dish_from_pricing_question(message) or _extract_item_from_stock_question(message)
        if item and not re.search(
            r"\b(?:update|set|adjust)\s+(?:the\s+)?(?:reorder|quantity|qty)\s+to\b",
            message.lower(),
        ):
            return _consult_route(["inventory"])

    return None


def _extract_item_from_stock_question(message: str) -> str:
    text = (message or "").strip()
    if not text:
        return ""
    patterns = [
        r"(?i)(?:how much|what(?:'s| is)|tell me).+(?:on hand|in stock|inventory|quantity|qty|reorder).+(?:for|of|on)\s+(?:my\s+)?([A-Za-z][A-Za-z0-9\s'-]{2,50})",
        r"(?i)(?:on hand|in stock|reorder level|reorder threshold).+(?:for|of|on)\s+(?:my\s+)?([A-Za-z][A-Za-z0-9\s'-]{2,50})",
        r"(?i)(?:my\s+)?([A-Za-z][A-Za-z0-9\s'-]{2,50}).+(?:on hand|in stock|reorder level|reorder threshold)\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        name = re.sub(r"\*+", "", match.group(1)).strip(" .,!?:;?")
        if name and len(name.split()) <= 8:
            return name
    return ""


def just_built_from_inventory(consult_results: dict[str, Any]) -> bool:
    inventory_text = str(consult_results.get("inventory") or "")
    return bool(
        re.search(
            r"\b(created dish|updated dish|linked ingredient|open \*\*kitchen control\*\*)\b",
            inventory_text,
            re.I,
        )
    )


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

    thread = _thread_history_from_state(state)
    kitchen_built_in_thread = thread_has_kitchen_build_in_thread(thread)
    awaiting_save = (
        thread_awaiting_kitchen_save_confirm(thread)
        or (
            thread_has_recipe_draft(thread)
            and not kitchen_built_in_thread
        )
        or (bool(recipe_build) and not kitchen_built_in_thread)
        or ("create" in consulted and not kitchen_built_in_thread and not just_built_from_inventory(consult_results))
    )
    if awaiting_save:
        return reply

    if not pending and not recipe_build:
        locked = infer_locked_dish(state)
        just_built = just_built_from_inventory(consult_results)
        kitchen_built = kitchen_built_in_thread or just_built
        if locked and kitchen_built and "business" not in consulted:
            reply += (
                f"\n\n**{locked}** is in your kitchen. "
                "Would you like a **margin pass**? I can consult the **Business Agent** "
                "for sell price and food cost."
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
