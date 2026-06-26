"""Canonical kitchen catalog reads — DB values only (matches Kitchen control cards)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from db.mongo import find_many
from tools.core.menu_actions import resolve_addon_slug, resolve_dish_slug, resolve_ingredient_slug

CatalogKind = Literal["ingredient", "dish", "addon"]
TARGET_MARGIN_PCT = 65.0


def _recipe_for_target(
    restaurant_id: str,
    *,
    kind: str,
    target_slug: str,
    target_name: str = "",
) -> dict[str, Any] | None:
    recipes = find_many(
        "recipes",
        restaurant_id,
        {
            "foodCost": 1,
            "sellPrice": 1,
            "dishSlug": 1,
            "dishName": 1,
            "targetSlug": 1,
            "kind": 1,
        },
        extra_filter={"kind": kind},
    )
    name_lower = target_name.lower()
    for recipe in recipes:
        slug = str(recipe.get("dishSlug") or recipe.get("targetSlug") or "")
        if slug and slug == target_slug:
            return recipe
        if target_name and str(recipe.get("dishName", "")).lower() == name_lower:
            return recipe
    return None


def ingredient_facts(
    restaurant_id: str,
    *,
    slug: str = "",
    name: str = "",
) -> dict[str, Any] | None:
    ing = resolve_ingredient_slug(restaurant_id, slug=slug, name=name)
    if not ing:
        return None
    expiry = ing.get("expiryDate")
    expiry_str = ""
    if expiry:
        if isinstance(expiry, datetime):
            expiry_str = expiry.date().isoformat()
        else:
            expiry_str = str(expiry)[:10]
    qty = float(ing.get("currentQty", 0) or 0)
    threshold = float(ing.get("reorderThreshold", 0) or 0)
    unit = str(ing.get("inventoryUnit") or "each")
    return {
        "kind": "ingredient",
        "name": str(ing.get("name", "ingredient")),
        "slug": str(ing.get("slug", "")),
        "category": str(ing.get("category") or ""),
        "currentQty": qty,
        "reorderThreshold": threshold,
        "inventoryUnit": unit,
        "label": str(ing.get("label") or ""),
        "brandName": str(ing.get("brandName") or ""),
        "expiryDate": expiry_str,
        "lowStock": qty <= threshold,
    }


def menu_item_facts(
    restaurant_id: str,
    *,
    kind: Literal["dish", "addon"],
    slug: str = "",
    name: str = "",
) -> dict[str, Any] | None:
    if kind == "dish":
        row = resolve_dish_slug(restaurant_id, slug=slug, name=name)
    else:
        row = resolve_addon_slug(restaurant_id, slug=slug, name=name)
    if not row:
        return None

    item_slug = str(row.get("slug", ""))
    item_name = str(row.get("name", kind))
    sell = float(row.get("sellPrice") or 0)
    recipe = _recipe_for_target(
        restaurant_id,
        kind=kind,
        target_slug=item_slug,
        target_name=item_name,
    )
    cost = float(recipe.get("foodCost", 0) if recipe else 0)
    margin = round(sell - cost, 2) if sell > 0 and cost > 0 else 0.0
    pct = round(margin / sell * 100, 1) if sell > 0 and margin > 0 else 0.0

    return {
        "kind": kind,
        "name": item_name,
        "slug": item_slug,
        "sellPrice": sell,
        "foodCost": cost,
        "margin": margin,
        "marginPct": pct,
        "recipeStatus": str(row.get("recipeStatus") or "new"),
        "classification": str(row.get("classification") or row.get("category") or ""),
    }


def dish_facts(restaurant_id: str, *, slug: str = "", name: str = "") -> dict[str, Any] | None:
    return menu_item_facts(restaurant_id, kind="dish", slug=slug, name=name)


def addon_facts(restaurant_id: str, *, slug: str = "", name: str = "") -> dict[str, Any] | None:
    return menu_item_facts(restaurant_id, kind="addon", slug=slug, name=name)


def format_ingredient_facts(facts: dict[str, Any]) -> str:
    lines = [
        f"**{facts['name']}** (`{facts['slug']}`)",
        f"- **On hand:** {facts['currentQty']:.2f} {facts['inventoryUnit']}",
        f"- **Reorder level:** {facts['reorderThreshold']:.2f} {facts['inventoryUnit']}",
        f"- Category: {facts['category'] or 'misc'}",
    ]
    if facts.get("label"):
        lines.append(f"- Label: {facts['label']}")
    if facts.get("brandName"):
        lines.append(f"- Brand: {facts['brandName']}")
    if facts.get("expiryDate"):
        lines.append(f"- Expires: {facts['expiryDate']}")
    if facts.get("lowStock"):
        lines.append("- ⚠ At or below reorder level.")
    return "\n".join(lines)


def format_menu_item_facts(facts: dict[str, Any]) -> str:
    kind_label = "Add-on" if facts["kind"] == "addon" else "Dish"
    lines = [
        f"**{facts['name']}** (`{facts['slug']}`) — {kind_label}",
        f"- **Sell price (menu):** ${facts['sellPrice']:.2f}",
    ]
    if facts["foodCost"] > 0:
        lines.append(f"- **Food cost:** ${facts['foodCost']:.2f}")
        lines.append(
            f"- **Margin:** ${facts['margin']:.2f} ({facts['marginPct']:.0f}%)"
        )
    elif facts["sellPrice"] > 0:
        lines.append("- Food cost: still calculating (link recipe ingredients).")
    if facts.get("classification"):
        lines.append(f"- Classification: {facts['classification']}")
    lines.append(f"- Recipe status: {facts.get('recipeStatus', 'new')}")
    return "\n".join(lines)


def format_ingredient_detail(
    restaurant_id: str,
    *,
    slug: str = "",
    name: str = "",
) -> str:
    facts = ingredient_facts(restaurant_id, slug=slug, name=name)
    if not facts:
        return "Ingredient not found — provide slug or name."
    return format_ingredient_facts(facts)


def format_dish_detail(
    restaurant_id: str,
    *,
    slug: str = "",
    name: str = "",
) -> str:
    facts = dish_facts(restaurant_id, slug=slug, name=name)
    if not facts:
        return "Dish not found — provide slug or name."
    return format_menu_item_facts(facts)


def format_addon_detail(
    restaurant_id: str,
    *,
    slug: str = "",
    name: str = "",
) -> str:
    facts = addon_facts(restaurant_id, slug=slug, name=name)
    if not facts:
        return "Add-on not found — provide slug or name."
    return format_menu_item_facts(facts)


def format_dish_pricing_text(
    restaurant_id: str,
    *,
    slug: str = "",
    name: str = "",
) -> str:
    facts = dish_facts(restaurant_id, slug=slug, name=name)
    if not facts:
        return "Provide a dish slug or name to look up menu pricing."
    if facts["sellPrice"] <= 0:
        return (
            f"**{facts['name']}** has no sell price set yet — add pricing in Kitchen control first."
        )
    body = format_menu_item_facts(facts)
    if facts["foodCost"] > 0 and facts["marginPct"] < TARGET_MARGIN_PCT:
        suggested = round(facts["foodCost"] / (1 - TARGET_MARGIN_PCT / 100), 2)
        body += (
            f"\nBelow target — suggested **sell price** for ~{TARGET_MARGIN_PCT:.0f}% margin: "
            f"**${suggested:.2f}**. Margin dollars are not the sell price."
        )
    elif facts["foodCost"] > 0:
        body += "\nHealthy margin — no change needed."
    return body


def format_margin_rankings(
    restaurant_id: str,
    *,
    view: str = "highest",
    limit: int = 10,
) -> str:
    dishes = find_many(
        "dishes",
        restaurant_id,
        {"name": 1, "slug": 1, "sellPrice": 1},
    )
    recipes = find_many(
        "recipes",
        restaurant_id,
        {"foodCost": 1, "dishSlug": 1, "targetSlug": 1, "kind": 1},
        extra_filter={"kind": "dish"},
    )
    cost_by_slug: dict[str, float] = {}
    for recipe in recipes:
        slug = str(recipe.get("dishSlug") or recipe.get("targetSlug") or "")
        if slug:
            cost_by_slug[slug] = float(recipe.get("foodCost", 0) or 0)

    rows: list[tuple[str, float, float, float, float]] = []
    for dish in dishes:
        slug = str(dish.get("slug", ""))
        sell = float(dish.get("sellPrice") or 0)
        cost = cost_by_slug.get(slug, 0.0)
        if sell <= 0 or cost <= 0:
            continue
        margin = sell - cost
        pct = margin / sell * 100
        rows.append((str(dish.get("name", "dish")), sell, cost, margin, pct))

    if not rows:
        return "No priced dishes yet — set sell prices in Kitchen control and link recipes."

    reverse = view.lower() != "lowest"
    rows.sort(key=lambda row: row[3], reverse=reverse)
    return "\n".join(
        f"- {name}: **sell ${sell:.2f}**, food cost ${cost:.2f}, margin ${margin:.2f} ({pct:.0f}%)"
        for name, sell, cost, margin, pct in rows[:limit]
    )


def format_catalog_search(
    restaurant_id: str,
    query: str,
    *,
    limit: int = 12,
) -> str:
    q = query.strip().lower()
    if not q:
        return "Provide a search query."

    from tools.core.catalog_lookup import search_addons, search_dishes, search_ingredients

    ingredients = search_ingredients(restaurant_id, query, limit=limit)
    dishes = search_dishes(restaurant_id, query, limit=limit)
    addons = search_addons(restaurant_id, query, limit=limit)

    blocks: list[str] = []
    if ingredients:
        ing_lines: list[str] = []
        for row in ingredients:
            facts = ingredient_facts(restaurant_id, slug=str(row.get("slug", "")))
            if facts:
                ing_lines.append(format_ingredient_facts(facts))
        if ing_lines:
            blocks.append("Pantry:\n" + "\n".join(ing_lines))
    if dishes:
        dish_lines: list[str] = []
        for row in dishes:
            facts = dish_facts(restaurant_id, slug=str(row.get("slug", "")))
            if facts:
                dish_lines.append(format_menu_item_facts(facts))
        if dish_lines:
            blocks.append("Dishes:\n" + "\n".join(dish_lines))
    if addons:
        addon_lines: list[str] = []
        for row in addons:
            facts = addon_facts(restaurant_id, slug=str(row.get("slug", "")))
            if facts:
                addon_lines.append(format_menu_item_facts(facts))
        if addon_lines:
            blocks.append("Add-ons:\n" + "\n".join(addon_lines))
    if not blocks:
        return f"No dishes, add-ons, or pantry items matching '{query}'."
    return "\n\n".join(blocks)
