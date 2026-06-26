"""Parse Creative recipe draft text into a recipe build plan payload."""

from __future__ import annotations

import re
from typing import Any

from tools.core.catalog_draft_helpers import clean_menu_dish_name
from tools.core.recipe_build import basic_pantry_name


def recipe_build_from_draft(text: str, dish_name: str = "") -> dict[str, Any] | None:
    body = (text or "").strip()
    if not body:
        return None

    name = clean_menu_dish_name(dish_name.strip())
    if not name:
        for heading in re.finditer(r"(?m)^#{1,3}\s+(.+?)\s*$", body):
            candidate = clean_menu_dish_name(heading.group(1).strip().strip("*"))
            if candidate:
                name = candidate
                break

    description = ""
    desc_match = re.search(
        r"(?is)(?:^|\n)(?:description|pos description)\s*:\s*(.+?)(?=\n(?:ingredients?|preparation|prep steps?|visual brief|suggested|pantry)|\Z)",
        body,
    )
    if desc_match:
        description = desc_match.group(1).strip()

    visual_brief = ""
    brief_match = re.search(
        r"(?is)(?:visual brief)\s*:\s*(.+?)(?=\n(?:suggested add|ingredients?|preparation|pantry)|\Z)",
        body,
    )
    if brief_match:
        visual_brief = brief_match.group(1).strip()

    ingredients: list[dict[str, Any]] = []
    ing_section = re.search(
        r"(?is)(?:^|\n)ingredients?\s*:?\s*\n(.+?)(?=\n(?:pantry gaps?|preparation|prep steps?|visual brief|suggested add)|\Z)",
        body,
    )
    if ing_section:
        for line in ing_section.group(1).splitlines():
            raw = line.strip().lstrip("-•*").strip()
            if not raw:
                continue
            if re.match(r"^pantry gaps?\b", raw, re.I):
                break
            parsed = _parse_ingredient_line(raw)
            if parsed:
                ingredients.append(parsed)

    ingredients = _dedupe_ingredients(ingredients)

    instructions: list[str] = []
    steps_section = re.search(
        r"(?is)(?:preparation steps?|prep steps?|instructions?)\s*:?\s*\n(.+?)(?=\n(?:visual brief|suggested add|pantry)|\Z)",
        body,
    )
    if steps_section:
        for match in re.finditer(r"(?m)^\s*\d+[\).\]:]\s*(.+?)\s*$", steps_section.group(1)):
            step = match.group(1).strip()
            if step:
                instructions.append(step)

    if not name or not ingredients:
        return None

    return {
        "dishName": name,
        "description": description,
        "visualBrief": visual_brief,
        "classification": "other",
        "sellPrice": None,
        "instructions": instructions,
        "ingredients": [
            {
                "name": basic_pantry_name(str(row["name"])),
                "qty": row["qty"],
                "unit": row["unit"],
            }
            for row in ingredients
        ],
        "status": "ready_to_finalize",
    }


def _dedupe_ingredients(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for row in rows:
        key = basic_pantry_name(str(row.get("name") or "")).lower()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


def _parse_ingredient_line(raw: str) -> dict[str, Any] | None:
    text = raw.strip()
    if not text:
        return None
    if re.search(r"\bqty\s*0\b", text, re.I):
        return None
    if re.match(r"^pantry gaps?\b", text, re.I):
        return None

    if text.lower() in ("salt", "pepper") and ":" not in text:
        qty = 1
        unit = "pinch" if text.lower() in ("salt", "pepper") else "each"
        return {"name": text.title(), "qty": qty, "unit": unit}

    colon = re.match(r"^(.+?)\s*:\s*(.+)$", text)
    if colon:
        name = colon.group(1).strip()
        rest = colon.group(2).strip().lower()
        if rest in ("to taste", "as needed"):
            return {"name": name, "qty": 1, "unit": "pinch"}
        qty_match = re.match(r"(\d+(?:\.\d+)?)\s*(.+)", rest)
        if qty_match:
            return {
                "name": name,
                "qty": float(qty_match.group(1)),
                "unit": _normalize_unit(qty_match.group(2)),
            }
        return {"name": name, "qty": 1, "unit": "each"}

    dash_qty = re.match(
        r"^(.+?)\s+[—–-]\s*(\d+(?:\.\d+)?)\s*(cup|cups|oz|tbsp|tsp|each|slice|slices|g|lb|ml|l|pinch)\b",
        text,
        re.I,
    )
    if dash_qty:
        return {
            "name": dash_qty.group(1).strip(),
            "qty": float(dash_qty.group(2)),
            "unit": _normalize_unit(dash_qty.group(3)),
        }

    return {"name": text, "qty": 1, "unit": "each"}


def _normalize_unit(unit: str) -> str:
    cleaned = unit.strip().lower().rstrip(".")
    if cleaned in ("cups",):
        return "cup"
    if cleaned in ("slices",):
        return "slice"
    if cleaned in ("grams", "gram"):
        return "g"
    if cleaned in ("tablespoon", "tablespoons"):
        return "tbsp"
    if cleaned in ("teaspoon", "teaspoons"):
        return "tsp"
    return cleaned or "each"
