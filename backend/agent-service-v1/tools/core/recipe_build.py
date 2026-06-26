"""Plan and format full recipe → pantry + menu catalog builds."""

from __future__ import annotations

import re
from typing import Any

from tools.core.catalog_lookup import check_create_ingredient, format_ingredient_summary, search_ingredients
from tools.core.menu_actions import resolve_ingredient_slug

_PREP_PREFIX_RE = re.compile(
    r"^(?:ripe|fresh|frozen|diced|sliced|chopped|crushed|whole|organic|raw|"
    r"unsweetened|sweetened|plain|low[- ]fat|non[- ]fat|fat[- ]free|large|small|medium)\s+",
    re.I,
)

_FORM_MAP: dict[str, str] = {
    "ice cubes": "Ice",
    "ice cube": "Ice",
    "crushed ice": "Ice",
    "bagged ice": "Ice",
}


def _title_case_ingredient(text: str) -> str:
    small = {"and", "or", "with", "of", "in"}
    words = text.split()
    return " ".join(w.lower() if w.lower() in small else w.capitalize() for w in words)


def basic_pantry_name(name: str) -> str:
    """Strip recipe prep words so pantry items match store product names (Mango not Ripe Mango)."""
    text = re.sub(r"\s*\([^)]*\)", "", name).strip()
    lower = re.sub(r"\s+", " ", text).strip().lower()
    for phrase, canonical in sorted(_FORM_MAP.items(), key=lambda x: -len(x[0])):
        if lower == phrase or phrase in lower:
            return canonical
    cleaned = text
    while True:
        nxt = _PREP_PREFIX_RE.sub("", cleaned).strip()
        if nxt == cleaned:
            break
        cleaned = nxt
    return _title_case_ingredient(cleaned) if cleaned else name.strip()


def ingredient_search_query(basic_name: str) -> str:
    """Grocery search phrasing — avoids unrelated 'ice' hits (e.g. chewing-gum flavors)."""
    lower = basic_name.strip().lower()
    if lower in ("ice", "ice cubes", "ice cube"):
        return "bagged ice cubes grocery"
    return basic_name.strip()


def _ingredient_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _normalize_unit(unit: str) -> str:
    cleaned = unit.strip().lower()
    if cleaned in ("cups",):
        return "cup"
    if cleaned in ("slices",):
        return "slice"
    if cleaned in ("grams", "gram"):
        return "g"
    return cleaned or "each"


def infer_qty_unit(name: str, classification: str = "") -> tuple[float, str]:
    """Reasonable per-serving qty/unit when the recipe draft omits them."""
    lower = name.lower()
    class_lower = classification.lower()
    beverage = class_lower in ("juice", "beverage", "drink", "smoothie") or "smoothie" in class_lower

    if re.search(r"\bice\b", lower):
        return (1.0, "cup")
    if re.search(r"\b(juice|nectar)\b", lower):
        return (4.0, "oz")
    if re.search(r"\b(puree|purée|yogurt|mango|banana|berry|berries)\b", lower):
        return (0.5, "cup")
    if re.search(r"\b(whipped\s+cream|cream)\b", lower):
        return (2.0, "tbsp")
    if re.search(r"\b(lime|lemon)\b", lower) and "juice" in lower:
        return (1.0, "tbsp")
    if re.search(r"\b(milk|half[- ]and[- ]half)\b", lower):
        return (0.5, "cup")
    if beverage:
        return (4.0, "oz")
    return (1.0, "each")


def _parse_ingredient_line(text: str) -> dict[str, Any] | None:
    raw = text.strip().strip(".")
    if not raw or len(raw) < 2:
        return None
    if re.search(r"\b(processing|hold on|done!|next step)\b", raw, re.I):
        return None

    qty_match = re.search(
        r"(\d+(?:\.\d+)?(?:/\d+)?)\s*(cup|cups|oz|tbsp|tsp|ml|l|each|slice|slices|g|gram|grams)\b",
        raw,
        re.I,
    )
    if qty_match:
        qty = float(qty_match.group(1))
        unit = _normalize_unit(qty_match.group(2))
        name = re.sub(qty_match.group(0), "", raw, count=1).strip(" -–—:")
    else:
        qty = None
        unit = None
        name = re.sub(r"\s*\([^)]*\)\s*", " ", raw).strip(" -–—:")

    name = re.sub(r"^(optional|for topping)\s*[:\-]?\s*", "", name, flags=re.I).strip()
    name = re.sub(r"\s+", " ", name).strip()
    if not name or len(name) < 2:
        return None

    row: dict[str, Any] = {"name": name}
    if qty is not None:
        row["qty"] = qty
    if unit:
        row["unit"] = unit
    return row


def _looks_like_ingredient_line(text: str) -> bool:
    lower = text.lower()
    if re.search(r"\b(processing|confirm|specialist|connect|suggested add-?on|visual brief)\b", lower):
        return False
    if "→" in text:
        return False
    if re.search(r"^\$?[\d.]+", text.strip()):
        return False
    if re.search(
        r"\d+(?:\.\d+)?\s*(cup|cups|oz|tbsp|tsp|ml|l|each|slice|slices|g|gram|grams)\b",
        lower,
    ):
        return True
    if re.search(r"[—–-]\s*\d", text):
        return True
    food_hints = (
        "mango",
        "yogurt",
        "juice",
        "cream",
        "ice",
        "lime",
        "milk",
        "berry",
        "banana",
        "puree",
        "sugar",
        "honey",
        "syrup",
        "chia",
        "almond",
        "protein",
        "avocado",
        "spinach",
        "tomato",
        "bread",
        "egg",
        "cheese",
        "bacon",
        "pepper",
        "onion",
        "garlic",
        "oil",
        "butter",
        "salt",
    )
    return any(hint in lower for hint in food_hints)


def extract_dish_name_from_history(messages: list[dict[str, str]]) -> str:
    """Dish name from user intent or Creative's recipe draft in thread."""
    from tools.core.catalog_draft_helpers import (
        clean_menu_dish_name,
        is_valid_recipe_dish_name,
        title_case_dish_name,
    )

    for row in reversed(messages):
        text = str(row.get("content") or "").strip()
        if not text:
            continue
        ready = re.search(
            r"\bready to add\s+\*\*([^*]+)\*\*(?:\s+to\s+kitchen)?",
            text,
            re.I,
        )
        if ready:
            name = clean_menu_dish_name(ready.group(1))
            if name:
                return name
        ready_plain = re.search(
            r"\bready to add(?:\s+the)?\s+(.+?)\s+to\s+kitchen\b",
            text,
            re.I,
        )
        if ready_plain:
            name = clean_menu_dish_name(ready_plain.group(1).strip().strip("*"))
            if name:
                return name
        for pattern in (
            r"(?:\*\*)?(?:menu name|proposed dish|dish to add)\s*:?\s*\*?\*?\s*([^\n*]+)",
            r"(?:^|\n)#{1,3}\s*([^\n#*]+)\s*\n",
            r"(?:^|\n)\s*[-•*]?\s*name\s*:\s*([^\n]+)",
            r"\b(?:confirm|kitchen build for)(?:\s+the)?\s+\*\*([^*]+)\*\*",
        ):
            match = re.search(pattern, text, re.I)
            if match:
                name = clean_menu_dish_name(match.group(1).strip().strip("*"))
                if not name:
                    name = title_case_dish_name(match.group(1).strip().strip("*"))
                if name and is_valid_recipe_dish_name(name):
                    return name

    for row in reversed(messages):
        if str(row.get("role") or "") != "user":
            continue
        text = str(row.get("content") or "").strip()
        quoted = re.search(r'\bdish\s+["“\']([^"”\']+)["”\']', text, re.I)
        if quoted:
            name = title_case_dish_name(quoted.group(1).strip())
            if name and is_valid_recipe_dish_name(name):
                return name
        match = re.search(r"\b(?:add|create)\s+(?:a\s+)?dish\s+(.+)$", text, re.I)
        if match:
            name = title_case_dish_name(re.sub(r"\b(please|thanks)\b.*", "", match.group(1), flags=re.I))
            if name and is_valid_recipe_dish_name(name):
                return name
    return ""


def thread_has_kitchen_build_in_thread(messages: list[dict[str, str]]) -> bool:
    for row in messages:
        if row.get("role") != "assistant":
            continue
        text = str(row.get("content") or "")
        if re.search(
            r"\b(created dish|updated dish)\b.+\b(linked ingredient|recipe steps)\b",
            text,
            re.I,
        ):
            return True
    return False


def thread_has_recipe_draft(messages: list[dict[str, str]]) -> bool:
    if thread_has_kitchen_build_in_thread(messages):
        return False

    from agents.head.reply_sanitizer import is_dish_brainstorm_reply

    latest_assistant = ""
    for row in reversed(messages):
        if row.get("role") == "assistant" and str(row.get("content") or "").strip():
            latest_assistant = str(row["content"])
            break
    if latest_assistant and is_dish_brainstorm_reply(latest_assistant):
        return False

    extracted = extract_recipe_draft_from_history(messages)
    if extracted.get("ingredients") and extracted.get("instructions"):
        return True

    assistant_text = "\n".join(
        str(row.get("content") or "")
        for row in messages
        if row.get("role") == "assistant"
    )
    if not assistant_text.strip():
        return False

    has_dish_context = bool(
        re.search(r"(?:menu name|proposed dish|pos description|visual brief|suggested add-?ons?)", assistant_text, re.I)
    )
    asks_confirm = bool(
        re.search(
            r"\b(please confirm|would you like to proceed|confirm if you(?:'d| would) like|ready to add)\b",
            assistant_text,
            re.I,
        )
    )
    return asks_confirm and has_dish_context


def extract_recipe_draft_from_history(messages: list[dict[str, str]]) -> dict[str, Any]:
    """Pull ingredient rows, instruction steps, and visual brief from recent assistant recipe drafts."""
    ingredients: list[dict[str, Any]] = []
    instructions: list[str] = []
    description = ""
    visual_brief = ""
    seen_names: set[str] = set()

    from agents.head.reply_sanitizer import is_dish_brainstorm_reply

    assistant_texts = [
        str(row.get("content") or "")
        for row in messages
        if row.get("role") == "assistant" and str(row.get("content") or "").strip()
    ]

    for text in reversed(assistant_texts):
        if is_dish_brainstorm_reply(text):
            continue
        if not visual_brief:
            brief_match = re.search(
                r"(?:\*\*)?visual\s+brief(?:\*\*)?\s*:?\s*([^\n]+(?:\n(?!\n|\*\*)[^\n]+)*)",
                text,
                re.I,
            )
            if brief_match:
                visual_brief = brief_match.group(1).strip()

        if not instructions:
            step_block = re.search(
                r"(?:recipe|instructions?|prep steps?|steps?)\s*:?\s*\n([\s\S]+?)(?:\n\n[A-Z*#]|\Z)",
                text,
                re.I,
            )
            if step_block:
                for line in step_block.group(1).splitlines():
                    step = re.sub(r"^\s*\d+[\).\]]\s*", "", line.strip())
                    if step and len(step) > 8:
                        instructions.append(step)

        if len(ingredients) < 12:
            ing_block = re.search(
                r"(?:ingredients?(?:\s+for)?|here(?:'s| is) a draft of the ingredients)\s*[:\s]*\n([\s\S]*?)(?:\n\n|recipe:|instructions?|steps?:|\Z)",
                text,
                re.I,
            )
            lines = ing_block.group(1).splitlines() if ing_block else text.splitlines()
            for line in lines:
                bullet = re.match(r"^[-•*]\s+(.+)$", line.strip())
                if not bullet:
                    continue
                candidate = bullet.group(1).strip()
                if not _looks_like_ingredient_line(candidate):
                    continue
                parsed = _parse_ingredient_line(candidate)
                if not parsed:
                    continue
                key = _ingredient_key(str(parsed["name"]))
                if key in seen_names:
                    continue
                seen_names.add(key)
                ingredients.append(parsed)

        if not description:
            desc_match = re.search(
                r"(?:refreshing|features?|topped with|blend of)\s+([^.!\n]{12,160})",
                text,
                re.I,
            )
            if desc_match:
                description = desc_match.group(1).strip()

        if ingredients and instructions:
            break

    return {
        "ingredients": ingredients,
        "instructions": instructions,
        "description": description,
        "visualBrief": visual_brief,
    }


def plan_recipe_build(
    restaurant_id: str,
    client: object | None,
    *,
    dish_name: str,
    description: str = "",
    visual_brief: str = "",
    classification: str = "other",
    sell_price: float | None = None,
    ingredients: list[dict[str, Any]] | None = None,
    instructions: list[str] | None = None,
) -> dict[str, Any]:
    del client  # store product image search removed — pantry uses general names only
    dish = dish_name.strip()
    if not dish:
        raise ValueError("dish_name required")
    rows = ingredients or []
    if not rows:
        raise ValueError("Provide at least one recipe ingredient.")

    planned: list[dict[str, Any]] = []
    class_hint = classification.strip() or "other"
    for row in rows:
        name = str(row.get("name") or row.get("ingredient") or "").strip()
        if not name:
            continue
        basic_name = basic_pantry_name(name)
        key = _ingredient_key(basic_name)
        raw_qty = row.get("qty", row.get("qty_per_serving", row.get("qtyPerServing")))
        raw_unit = str(row.get("unit") or "").strip()
        if raw_qty is None or raw_qty == "":
            qty, unit = infer_qty_unit(name, class_hint)
        else:
            qty = float(raw_qty)
            unit = _normalize_unit(raw_unit) if raw_unit else infer_qty_unit(name, class_hint)[1]
        if not raw_unit and unit == "each" and qty == 1:
            qty, unit = infer_qty_unit(name, class_hint)

        pantry = resolve_ingredient_slug(restaurant_id, name=basic_name)
        if not pantry and basic_name.lower() != name.lower():
            pantry = resolve_ingredient_slug(restaurant_id, name=name)
        if not pantry:
            similar = search_ingredients(restaurant_id, basic_name, limit=1)
            if similar and str(similar[0].get("name", "")).lower() == basic_name.lower():
                pantry = similar[0]

        entry: dict[str, Any] = {
            "key": key,
            "name": basic_name,
            "qtyPerServing": qty,
            "unit": unit,
        }
        if pantry:
            entry["pantrySlug"] = str(pantry.get("slug", ""))
            entry["pantryName"] = str(pantry.get("name", name))
            entry["committedSlug"] = entry["pantrySlug"]
        planned.append(entry)

    if not planned:
        raise ValueError("No valid recipe ingredients.")

    steps = [str(step).strip() for step in (instructions or []) if str(step).strip()]

    return {
        "dishName": dish,
        "description": description.strip(),
        "visualBrief": visual_brief.strip(),
        "classification": classification.strip() or "other",
        "sellPrice": float(sell_price) if sell_price is not None else None,
        "instructions": steps,
        "ingredients": planned,
        "status": "ready_to_finalize",
    }


def format_recipe_build_plan(plan: dict[str, Any]) -> str:
    lines = [
        f"**Recipe build plan — {plan['dishName']}**",
        "",
        "Pantry items use general names — primary & secondary photos generate automatically in Kitchen control.",
        "",
    ]
    if plan.get("visualBrief"):
        lines.extend(["**Visual brief** (for dish photos):", str(plan["visualBrief"]).strip(), ""])
    for idx, row in enumerate(plan.get("ingredients") or [], start=1):
        name = row.get("name", "")
        qty = row.get("qtyPerServing", 1)
        unit = row.get("unit", "each")
        qty_label = f" — **{qty} {unit}** per serving"
        if row.get("pantrySlug"):
            lines.append(
                f"{idx}. **{name}**{qty_label} — already in pantry as `{row['pantrySlug']}` "
                f"({row.get('pantryName', name)})"
            )
        else:
            lines.append(f"{idx}. **{name}**{qty_label} — new pantry row (qty 0, label new)")
    lines.append("")
    lines.append(
        "Say **go ahead** to add ingredients, dish, recipe, and auto-generate packaging + dish photos."
    )
    return "\n".join(lines)


def apply_recipe_selections(plan: dict[str, Any], selections: dict[str, int]) -> dict[str, Any]:
    """Legacy — store product picks removed from chat; returns plan unchanged."""
    del selections
    return {**plan, "status": "ready_to_finalize"}


def auto_default_selections(plan: dict[str, Any]) -> dict[str, Any]:
    """No store picks required — plan is always ready to finalize."""
    return {**plan, "status": "ready_to_finalize"}


def parse_selections_from_message(message: str, plan: dict[str, Any]) -> dict[str, int]:
    """Legacy — image/product selection in chat removed."""
    del message, plan
    return {}


def dish_create_collision_message(restaurant_id: str, dish_name: str) -> str | None:
    from tools.core.catalog_lookup import check_create_dish, format_create_collision

    lookup = check_create_dish(restaurant_id, dish_name)
    if lookup.get("exact"):
        return format_create_collision("dish", dish_name, lookup)
    return None
