"""Plan and format full recipe → pantry + menu catalog builds."""

from __future__ import annotations

import re
from typing import Any

from image_suggestions import suggest_images
from tools.core.catalog_lookup import check_create_ingredient, format_ingredient_summary, search_ingredients
from tools.core.menu_actions import resolve_ingredient_slug

STORES = ("Costco", "Sysco", "Kroger", "Whole Foods", "US Foods")


def _ingredient_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _brand_from_label(label: str) -> str:
    parts = [p.strip() for p in re.split(r"[-–|]", label) if p.strip()]
    if len(parts) >= 2 and len(parts[0]) <= 24:
        return parts[0]
    return ""


def _build_store_options(client: object | None, ingredient_name: str) -> list[dict[str, Any]]:
    options: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    for store in STORES:
        images = suggest_images(
            client,
            ingredient_name,
            "ingredient",
            extra_keywords=f"{store} grocery product",
            use_gpt=False,
        )
        for img in images[:2]:
            url = str(img.url or "").strip()
            if not url or url.lower() in seen_urls:
                continue
            seen_urls.add(url.lower())
            options.append(
                {
                    "label": str(img.label or ingredient_name),
                    "brandName": _brand_from_label(str(img.label or "")),
                    "store": store,
                    "imageUrl": url,
                    "score": float(img.score or 0),
                }
            )
        if len(options) >= 6:
            break
    return options[:6]


def plan_recipe_build(
    restaurant_id: str,
    client: object | None,
    *,
    dish_name: str,
    description: str = "",
    classification: str = "other",
    sell_price: float | None = None,
    ingredients: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    dish = dish_name.strip()
    if not dish:
        raise ValueError("dish_name required")
    rows = ingredients or []
    if not rows:
        raise ValueError("Provide at least one recipe ingredient.")

    planned: list[dict[str, Any]] = []
    for row in rows:
        name = str(row.get("name") or row.get("ingredient") or "").strip()
        if not name:
            continue
        key = _ingredient_key(name)
        qty = float(row.get("qty") or row.get("qty_per_serving") or row.get("qtyPerServing") or 1)
        unit = str(row.get("unit") or "each").strip() or "each"

        pantry = resolve_ingredient_slug(restaurant_id, name=name)
        if not pantry:
            similar = search_ingredients(restaurant_id, name, limit=1)
            if similar and str(similar[0].get("name", "")).lower() == name.lower():
                pantry = similar[0]

        entry: dict[str, Any] = {
            "key": key,
            "name": name,
            "qtyPerServing": qty,
            "unit": unit,
            "options": [],
        }
        if pantry:
            entry["pantrySlug"] = str(pantry.get("slug", ""))
            entry["pantryName"] = str(pantry.get("name", name))
            entry["committedSlug"] = entry["pantrySlug"]
        else:
            entry["options"] = _build_store_options(client, name)
        planned.append(entry)

    if not planned:
        raise ValueError("No valid recipe ingredients.")

    missing = [row for row in planned if not row.get("committedSlug")]
    status = "ready_to_finalize" if not missing else "selecting"

    return {
        "dishName": dish,
        "description": description.strip(),
        "classification": classification.strip() or "other",
        "sellPrice": float(sell_price) if sell_price is not None else None,
        "ingredients": planned,
        "status": status,
    }


def format_recipe_build_plan(plan: dict[str, Any]) -> str:
    lines = [
        f"**Recipe build plan — {plan['dishName']}**",
        "",
        "I'll add pantry items (qty **0**, label **new**) and then create the dish with images.",
        "",
    ]
    for idx, row in enumerate(plan.get("ingredients") or [], start=1):
        name = row.get("name", "")
        if row.get("pantrySlug"):
            lines.append(
                f"{idx}. **{name}** — already in pantry as `{row['pantrySlug']}` "
                f"({row.get('pantryName', name)})"
            )
            continue
        lines.append(f"{idx}. **{name}** — pick a store product:")
        options = row.get("options") or []
        if not options:
            lines.append("   - No product photos found — say which brand/pack to add manually.")
            continue
        for opt_idx, opt in enumerate(options, start=1):
            store = opt.get("store") or "grocery"
            label = opt.get("label") or name
            brand = opt.get("brandName")
            brand_bit = f" ({brand})" if brand else ""
            lines.append(f"   - **{opt_idx}** — {store}{brand_bit}: {label}")
    lines.append("")
    if plan.get("status") == "selecting":
        lines.append(
            "Reply with your picks, e.g. `mango: 1, yogurt: 2` or tap the options below, "
            "then say **go ahead** to add ingredients and the dish."
        )
    else:
        lines.append("All ingredients are in pantry — say **go ahead** to create the dish and generate its image.")
    return "\n".join(lines)


def apply_recipe_selections(plan: dict[str, Any], selections: dict[str, int]) -> dict[str, Any]:
    updated = dict(plan)
    ingredients = []
    for row in plan.get("ingredients") or []:
        copy = dict(row)
        if copy.get("committedSlug"):
            ingredients.append(copy)
            continue
        key = str(copy.get("key") or "")
        pick = selections.get(key)
        if pick is None:
            ingredients.append(copy)
            continue
        options = copy.get("options") or []
        if pick < 1 or pick > len(options):
            ingredients.append(copy)
            continue
        chosen = options[pick - 1]
        copy["selectedIndex"] = pick - 1
        copy["selectedOption"] = chosen
        ingredients.append(copy)
    updated["ingredients"] = ingredients
    still_missing = [
        row for row in ingredients if not row.get("committedSlug") and not row.get("selectedOption")
    ]
    updated["status"] = "ready_to_finalize" if not still_missing else "selecting"
    return updated


def auto_default_selections(plan: dict[str, Any]) -> dict[str, Any]:
    """Pick the top store option for any ingredient still missing a selection."""
    selections: dict[str, int] = {}
    for row in plan.get("ingredients") or []:
        if row.get("committedSlug") or row.get("selectedOption"):
            continue
        options = row.get("options") or []
        if options:
            selections[str(row.get("key") or "")] = 1
    return apply_recipe_selections(plan, selections)


def parse_selections_from_message(message: str, plan: dict[str, Any]) -> dict[str, int]:
    selections: dict[str, int] = {}
    lower = message.lower()
    for row in plan.get("ingredients") or []:
        key = str(row.get("key") or "")
        name = str(row.get("name") or "").lower().strip()
        if not key or not name:
            continue
        patterns = [
            rf"{re.escape(name)}\s*[:#\-]?\s*(\d+)",
            rf"(\d+)\s+for\s+{re.escape(name)}",
            rf"pick\s+(\d+)\s+for\s+{re.escape(name)}",
            rf"{re.escape(name)}\s+option\s+(\d+)",
        ]
        for pattern in patterns:
            match = re.search(pattern, lower)
            if match:
                selections[key] = int(match.group(1))
                break
    return selections


def dish_create_collision_message(restaurant_id: str, dish_name: str) -> str | None:
    from tools.core.catalog_lookup import check_create_dish, format_create_collision

    lookup = check_create_dish(restaurant_id, dish_name)
    if lookup.get("exact"):
        return format_create_collision("dish", dish_name, lookup)
    return None
