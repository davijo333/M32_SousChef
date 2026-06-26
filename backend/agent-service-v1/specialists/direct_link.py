"""Direct tool calls for standalone chat link workflows — skip ReAct."""

from __future__ import annotations

import re
from typing import Any

from domain.context import TurnContext
from workflows.engine.loader import get_workflow
from workflows.engine.transitions import delegate_worker, find_step
from workflows.engine.state import WorkflowState
from workflows.engine.transitions import find_step, set_baggage


CHAT_LINK_WORKFLOW_IDS = frozenset(
    {
        "link_dish_ingredients_chat",
        "link_addon_ingredients_chat",
        "link_addons_to_dish_chat",
    }
)

PRONOUN_RE = re.compile(
    r"^(?:it|that|this|them|the add[\s-]?on|the modifier)$",
    re.I,
)


def uses_direct_delegate(workflow_id: str) -> bool:
    wf = get_workflow(workflow_id)
    return bool(wf and wf.get("direct_delegate"))


def _clean_name(raw: str) -> str:
    name = re.sub(r"\*+", "", (raw or "").strip()).strip("'\"")
    return re.sub(r"^(?:a|an|the)\s+", "", name, flags=re.I).strip()


def parse_dish_ingredient_link(message: str) -> tuple[str, str, str]:
    """Return (ingredient_name, dish_name, link_mode)."""
    text = (message or "").strip()
    if not text:
        return "", "", "add"
    mode = "remove" if re.search(r"(?i)\bremove\b", text) else "add"
    patterns = [
        r"(?i)(?:add|remove|link|update)\s+(?:the\s+)?(?:ingredient\s+)?['\"]?(.+?)['\"]?\s+to\s+(?:the\s+)?(.+?)(?:\s+recipe)?(?:[.?!]|$)",
        r"(?i)(?:add|remove|link)\s+(.+?)\s+(?:to|from)\s+(?:the\s+)?(.+?)(?:\s+recipe)?(?:[.?!]|$)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        ingredient = _clean_name(match.group(1))
        dish = _clean_name(match.group(2))
        if ingredient and dish and ingredient.lower() != dish.lower():
            return ingredient, dish, mode
    return "", "", mode


def parse_addon_ingredient_link(message: str) -> tuple[str, str, str]:
    """Return (ingredient_name, addon_name, link_mode)."""
    text = (message or "").strip()
    if not text:
        return "", "", "add"
    mode = "remove" if re.search(r"(?i)\bremove\b", text) else "add"
    patterns = [
        r"(?i)(?:link(?:ed)?|add|remove)\s+(?:the\s+)?(?:ingredient\s+)?['\"]?(.+?)['\"]?\s+to\s+(?:the\s+)?(?:add[\s-]?on\s+)?(.+?)(?:\s+recipe)?(?:\s+ingredients?)?(?:[.?!]|$)",
        r"(?i)(?:link|add|remove)\s+(?:the\s+)?(?:ingredient\s+)?['\"]?(.+?)['\"]?\s+to\s+(?:the\s+)?(.+?)\s+add[\s-]?on(?:\s+recipe)?(?:\s+ingredients?)?(?:[.?!]|$)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        ingredient = _clean_name(match.group(1))
        addon = _clean_name(match.group(2))
        addon = re.sub(r"\s+add[\s-]?on$", "", addon, flags=re.I).strip()
        addon = re.sub(r"\s+recipe$", "", addon, flags=re.I).strip()
        if ingredient and addon and ingredient.lower() != addon.lower():
            return ingredient, addon, mode
    return "", "", mode


def looks_like_addon_ingredient_link(message: str) -> bool:
    lower = (message or "").lower()
    if not re.search(r"add\s*[\s-]?on", lower):
        return False
    if re.search(r"(?i)\b(link(?:ed)?|add|remove)\b.+\b(ingredient|recipe|pantry)\b", lower):
        return True
    if re.search(r"(?i)\b(link(?:ed)?|add|remove)\b.+\bto\b.+\badd[\s-]?on", lower):
        return True
    if re.search(r"(?i)\badd[\s-]?on\b.+\b(recipe|ingredient)", lower):
        return True
    return False


_ADDON_NAME_PREFIX = re.compile(
    r"(?i)\b(?:glazed|crispy|candied|extra|double|triple|side|loaded|bacon|cheese|"
    r"spicy|hot|smoked|maple|garlic|herb|seasoned)\b"
)


def _looks_like_addon_name(name: str) -> bool:
    return bool(_ADDON_NAME_PREFIX.search((name or "").strip()))


def prefers_addon_ingredient_link(message: str) -> bool:
    """Prefer pantry→add-on link over add-on→dish when phrasing is ambiguous."""
    if looks_like_addon_ingredient_link(message):
        return True
    ing, addon, _ = parse_addon_ingredient_link(message)
    if not ing or not addon or ing.lower() == addon.lower():
        return False
    if len(ing.split()) >= 2 and len(addon.split()) == 1:
        return False
    ing_lower = ing.lower()
    addon_lower = addon.lower()
    if re.search(rf"\b{re.escape(ing_lower)}\b", addon_lower):
        return True
    if re.search(r"(?i)\badd[\s-]?on\b", message) and re.search(
        r"(?i)\b(recipe|ingredient|pantry)\b", message
    ):
        return True
    if len(ing.split()) == 1 and len(addon.split()) >= 2 and _looks_like_addon_name(addon):
        return True
    return False


def parse_addon_dish_link(message: str) -> tuple[str, str]:
    """Return (addon_name, dish_name). Empty addon_name means resolve from thread context."""
    text = (message or "").strip()
    if not text:
        return "", ""
    patterns = [
        r"(?i)\b(?:add|attach|link)\s+(?:the\s+)?(.+?)\s+as\s+(?:an?\s+)?add[\s-]?on\s+to\s+(?:the\s+)?(.+?)(?:[.?!]|$)",
        r"(?i)(?:link|attach)\s+(?:the\s+)?['\"]?(.+?)['\"]?\s+add[\s-]?on\s+to\s+(?:the\s+)?(.+?)(?:\s+dish)?(?:[.?!]|$)",
        r"(?i)(?:link|attach)\s+(?:the\s+)?['\"]?(.+?)['\"]?\s+(?:add[\s-]?on\s+)?to\s+(?:the\s+)?(.+?)(?:\s+dish)?(?:[.?!]|$)",
        r"(?i)\b(?:link|attach)\s+(?:it|that|this|them)\s+to\s+(?:the\s+)?(.+?)(?:[.?!]|$)",
    ]
    for index, pattern in enumerate(patterns):
        match = re.search(pattern, text)
        if not match:
            continue
        if index == 3:
            dish = _clean_name(match.group(1))
            return "", dish if dish else ""
        addon = _clean_name(match.group(1))
        dish = _clean_name(match.group(2))
        if dish and (not addon or PRONOUN_RE.match(addon)):
            return "", dish
        if addon and dish and addon.lower() != dish.lower():
            return addon, dish
    return "", ""


def _history_texts(history: list[Any] | None, user_message: str = "") -> list[str]:
    texts: list[str] = []
    if user_message.strip():
        texts.append(user_message.strip())
    for row in reversed(history or []):
        content = getattr(row, "content", None)
        if content is None and isinstance(row, dict):
            content = row.get("content")
        if isinstance(content, str) and content.strip():
            texts.append(content.strip())
    return texts


def extract_recent_addon_name(history: list[Any] | None, user_message: str = "") -> str:
    """Last add-on name mentioned in thread — for 'link it to pancakes' follow-ups."""
    addon, _ = parse_addon_dish_link(user_message)
    if addon and not PRONOUN_RE.match(addon):
        return addon

    patterns = [
        re.compile(r"\*\*([^*]+)\*\*\s*\(`addon-[^`]+`\)", re.I),
        re.compile(r"(?i)add-on\s+['\"]([^'\"]+)['\"]"),
        re.compile(r"(?i)add-on\s+\*\*([^*]+)\*\*"),
    ]
    for text in _history_texts(history, user_message):
        for pattern in patterns:
            match = pattern.search(text)
            if not match:
                continue
            name = _clean_name(match.group(1))
            if name and not PRONOUN_RE.match(name):
                return name
        if re.search(r"(?i)add-ons?:", text):
            match = re.search(r"\*\*([^*]+)\*\*", text)
            if match:
                name = _clean_name(match.group(1))
                if name and not PRONOUN_RE.match(name):
                    return name
    return ""


def prime_link_chat_intake(ctx: TurnContext | Any, state: WorkflowState) -> WorkflowState:
    """Parse chef message into baggage on first intake turn."""
    wf_id = state.workflow_id
    if wf_id not in CHAT_LINK_WORKFLOW_IDS or state.step_id != "intake":
        return state

    message = ctx.user_message or ""
    if wf_id == "link_dish_ingredients_chat":
        ingredient, dish, mode = parse_dish_ingredient_link(message)
        if not dish:
            return state
        return set_baggage(
            copy_state_with_name(state, dish),
            link_ingredient_name=ingredient,
            link_mode=mode,
        )

    if wf_id == "link_addons_to_dish_chat":
        addon, dish = parse_addon_dish_link(message)
        if not dish:
            return state
        if not addon:
            addon = extract_recent_addon_name(getattr(ctx, "history", None), message)
        return set_baggage(
            copy_state_with_name(state, dish),
            addon_name=addon,
        )

    if wf_id == "link_addon_ingredients_chat":
        ingredient, addon, mode = parse_addon_ingredient_link(message)
        if not addon:
            return state
        return set_baggage(
            copy_state_with_name(state, addon),
            link_ingredient_name=ingredient,
            link_mode=mode,
        )

    return state


def copy_state_with_name(state: WorkflowState, locked_name: str) -> WorkflowState:
    state.locked_name = locked_name
    return state


def try_direct_link(ctx: TurnContext, step_id: str | None) -> str | None:
    if not ctx.workflow_state:
        return None
    wf_id = ctx.workflow_state.workflow_id
    if wf_id not in CHAT_LINK_WORKFLOW_IDS:
        return None
    wf = get_workflow(wf_id)
    if not wf:
        return None
    step = find_step(wf, step_id or ctx.workflow_state.step_id)
    if not step or not step.get("tool"):
        return None
    return invoke_link_step_tool(ctx, step)


def invoke_link_step_tool(ctx: TurnContext, step: dict[str, Any]) -> str:
    step_id = str(step.get("id") or "")
    wf_id = ctx.workflow_state.workflow_id if ctx.workflow_state else ""

    if wf_id == "link_dish_ingredients_chat":
        if step_id == "lookup":
            return _lookup_dish_for_ingredient_link(ctx)
        if step_id == "check_recipe_ingredients":
            return _check_recipe_ingredients(ctx)
        if step_id == "persist":
            return _persist_dish_ingredient_link(ctx)

    if wf_id == "link_addons_to_dish_chat":
        if step_id == "lookup":
            return _lookup_addon_dish_link(ctx)
        if step_id == "persist":
            return _persist_addon_dish_link(ctx)

    if wf_id == "link_addon_ingredients_chat":
        if step_id == "lookup":
            return _lookup_addon_for_ingredient_link(ctx)
        if step_id == "check_recipe_ingredients":
            return _check_recipe_ingredients(ctx)
        if step_id == "persist":
            return _persist_addon_ingredient_link(ctx)

    return f"Unsupported direct link step: {step_id}"


def _baggage(ctx: TurnContext) -> dict[str, Any]:
    if not ctx.workflow_state:
        return {}
    return ctx.workflow_state.baggage or {}


def _set_baggage(ctx: TurnContext, **pairs: Any) -> None:
    if not ctx.workflow_state:
        return
    ctx.workflow_state = set_baggage(ctx.workflow_state, **pairs)


def _lookup_dish_for_ingredient_link(ctx: TurnContext) -> str:
    from tools.core.catalog_reads import format_dish_detail
    from tools.core.menu_actions import resolve_dish_slug

    baggage = _baggage(ctx)
    dish_name = ctx.workflow_state.locked_name if ctx.workflow_state else ""
    ingredient = str(baggage.get("link_ingredient_name") or "").strip()
    if not dish_name:
        return "Dish not found — provide slug or name."
    if not ingredient:
        return "Tell me which ingredient to link and which dish (e.g. add honey to Mango Paradise Smoothie)."

    dish = resolve_dish_slug(ctx.restaurant_id, name=dish_name)
    if not dish:
        return "Dish not found — provide slug or name."

    dish_slug = str(dish.get("slug", ""))
    dish_name = str(dish.get("name", dish_name))
    if ctx.workflow_state:
        ctx.workflow_state.locked_name = dish_name
    _set_baggage(ctx, locked_slug=dish_slug, locked_name=dish_name, link_ingredient_name=ingredient)

    detail = format_dish_detail(ctx.restaurant_id, slug=dish_slug, name=dish_name)
    mode = str(baggage.get("link_mode") or "add")
    verb = "Remove" if mode == "remove" else "Add"
    return f"{detail}\n\n{verb} **{ingredient}** on this dish after you confirm."


def _lookup_addon_for_ingredient_link(ctx: TurnContext) -> str:
    from tools.core.catalog_reads import format_addon_detail
    from tools.core.menu_actions import resolve_addon_slug

    baggage = _baggage(ctx)
    addon_name = ctx.workflow_state.locked_name if ctx.workflow_state else ""
    ingredient = str(baggage.get("link_ingredient_name") or "").strip()
    if not addon_name:
        return "Add-on not found — provide slug or name."
    if not ingredient:
        return "Tell me which ingredient to link and which add-on (e.g. link bananas to glazed bananas add-on)."

    addon = resolve_addon_slug(ctx.restaurant_id, name=addon_name)
    if not addon:
        return "Add-on not found — provide slug or name."

    addon_slug = str(addon.get("slug", ""))
    addon_name = str(addon.get("name", addon_name))
    if ctx.workflow_state:
        ctx.workflow_state.locked_name = addon_name
    _set_baggage(ctx, locked_slug=addon_slug, locked_name=addon_name, link_ingredient_name=ingredient)

    detail = format_addon_detail(ctx.restaurant_id, slug=addon_slug, name=addon_name)
    mode = str(baggage.get("link_mode") or "add")
    verb = "Remove" if mode == "remove" else "Add"
    return f"{detail}\n\n{verb} **{ingredient}** on this add-on after you confirm."


def _check_recipe_ingredients(ctx: TurnContext) -> str:
    from tools.core.catalog_lookup import search_ingredients

    baggage = _baggage(ctx)
    ingredient = str(baggage.get("link_ingredient_name") or "").strip()
    if not ingredient:
        return "ingredient_names_missing: ['unknown']\nProvide an ingredient name to link."

    matches = search_ingredients(ctx.restaurant_id, ingredient, limit=3)
    if matches:
        slug = str(matches[0].get("slug", ""))
        name = str(matches[0].get("name", ingredient))
        _set_baggage(
            ctx,
            link_ingredient_slug=slug,
            link_ingredient_resolved=name,
            ingredient_names_missing_empty=True,
        )
        return (
            f"ingredient_names_missing: []\n"
            f"All ingredients matched.\n"
            f"- **{name}** (`{slug}`)"
        )

    _set_baggage(
        ctx,
        ingredient_names_missing=[ingredient],
        ingredient_names_missing_empty=False,
    )
    return f"ingredient_names_missing: [{ingredient!r}]\nMissing pantry item: **{ingredient}**."


def _persist_dish_ingredient_link(ctx: TurnContext) -> str:
    from specialists.react_runner import build_core_ctx
    from tools.core.factory import _apply_menu

    baggage = _baggage(ctx)
    dish_slug = str(baggage.get("locked_slug") or "").strip()
    dish_name = str(baggage.get("locked_name") or ctx.workflow_state.locked_name if ctx.workflow_state else "")
    ingredient_slug = str(baggage.get("link_ingredient_slug") or "").strip()
    mode = str(baggage.get("link_mode") or "add")
    if not dish_slug or not ingredient_slug:
        return "Missing dish or ingredient slug — restart the link workflow."

    core_ctx = build_core_ctx(ctx)
    apply_menu = _apply_menu(ctx.restaurant_id, core_ctx)
    reply = apply_menu.invoke(
        {
            "action": "link_dish_ingredients",
            "slug": dish_slug,
            "name": dish_name,
            "ingredient_slugs": [ingredient_slug],
            "link_mode": mode,
        }
    )
    _capture_side_effects(ctx, core_ctx)
    return str(reply)


def _persist_addon_ingredient_link(ctx: TurnContext) -> str:
    from specialists.react_runner import build_core_ctx
    from tools.core.factory import _apply_menu

    baggage = _baggage(ctx)
    addon_slug = str(baggage.get("locked_slug") or "").strip()
    addon_name = str(baggage.get("locked_name") or ctx.workflow_state.locked_name if ctx.workflow_state else "")
    ingredient_slug = str(baggage.get("link_ingredient_slug") or "").strip()
    mode = str(baggage.get("link_mode") or "add")
    if not addon_slug or not ingredient_slug:
        return "Missing add-on or ingredient slug — restart the link workflow."

    core_ctx = build_core_ctx(ctx)
    apply_menu = _apply_menu(ctx.restaurant_id, core_ctx)
    reply = apply_menu.invoke(
        {
            "action": "link_addon_ingredients",
            "slug": addon_slug,
            "name": addon_name,
            "ingredient_slugs": [ingredient_slug],
            "link_mode": mode,
        }
    )
    _capture_side_effects(ctx, core_ctx)
    return str(reply)


def _lookup_addon_dish_link(ctx: TurnContext) -> str:
    from db.mongo import find_one
    from tools.core.catalog_reads import format_dish_detail
    from tools.core.menu_actions import resolve_addon_slug, resolve_dish_slug

    baggage = _baggage(ctx)
    addon_name = str(baggage.get("addon_name") or "").strip()
    dish_name = ctx.workflow_state.locked_name if ctx.workflow_state else ""
    if not addon_name:
        addon_name = extract_recent_addon_name(getattr(ctx, "history", None), ctx.user_message or "")
    if not addon_name or not dish_name:
        return "Tell me which add-on to link and which dish (e.g. link Sausage add-on to The Sunrise Stack)."

    dish = resolve_dish_slug(ctx.restaurant_id, name=dish_name)
    if not dish:
        return "Dish not found — provide slug or name."
    addon = resolve_addon_slug(ctx.restaurant_id, name=addon_name)
    if not addon:
        return f"Add-on **{addon_name}** not found — check the name or add it first."

    dish_slug = str(dish.get("slug", ""))
    dish_name = str(dish.get("name", dish_name))
    addon_slug = str(addon.get("slug", ""))
    addon_name = str(addon.get("name", addon_name))

    addon_row = find_one(
        "addons",
        ctx.restaurant_id,
        {"slug": addon_slug},
        {"linkedDishSlugs": 1},
    )
    existing = list((addon_row or {}).get("linkedDishSlugs") or [])
    already = dish_slug in existing
    merged = existing if already else existing + [dish_slug]

    if ctx.workflow_state:
        ctx.workflow_state.locked_name = dish_name
    _set_baggage(
        ctx,
        locked_dish_slug=dish_slug,
        locked_name=dish_name,
        addon_slug=addon_slug,
        addon_name=addon_name,
        merged_linked_dish_slugs=merged,
        already_linked=already,
    )

    detail = format_dish_detail(ctx.restaurant_id, slug=dish_slug, name=dish_name)
    if already:
        return (
            f"{detail}\n\n"
            f"Add-on **{addon_name}** (`{addon_slug}`) is already linked to this dish."
        )
    return (
        f"{detail}\n\n"
        f"Link add-on **{addon_name}** (`{addon_slug}`) to **{dish_name}** after you confirm."
    )


def _persist_addon_dish_link(ctx: TurnContext) -> str:
    from specialists.react_runner import build_core_ctx
    from tools.core.factory import _apply_menu

    baggage = _baggage(ctx)
    if baggage.get("already_linked"):
        return "Add-on is already linked to this dish — no change needed."

    addon_slug = str(baggage.get("addon_slug") or "").strip()
    addon_name = str(baggage.get("addon_name") or "").strip()
    merged = list(baggage.get("merged_linked_dish_slugs") or [])
    if not addon_slug or not merged:
        return "Missing add-on or dish slug — restart the link workflow."

    core_ctx = build_core_ctx(ctx)
    apply_menu = _apply_menu(ctx.restaurant_id, core_ctx)
    reply = apply_menu.invoke(
        {
            "action": "update_addon",
            "slug": addon_slug,
            "linked_dish_slugs": merged,
        }
    )
    _capture_side_effects(ctx, core_ctx)
    return str(reply)


def _capture_side_effects(ctx: TurnContext, core_ctx: Any) -> None:
    pending = core_ctx.latest_pending()
    ctx.consult_side_effects["inventory"] = {
        "pending_action": pending,
        "recipe_build": core_ctx.recipe_build,
        "navigation_action": core_ctx.latest_navigation(),
    }
