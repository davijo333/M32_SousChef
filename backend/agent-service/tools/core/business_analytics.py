"""Business analytics helpers — mirrors dashboard-sales-analytics.ts formulas."""

from __future__ import annotations

from typing import Any, Literal

from context.finance import FinancePeriodRange, finance_period_range, order_in_period, parse_finance_period
from db.mongo import find_many
from tools.core.menu_actions import resolve_dish_slug, resolve_ingredient_slug, suggest_price_change_text

REORDER_APPROACH_MULTIPLIER = 1.5
TARGET_MARGIN_PCT = 65.0
RANKING_LIMIT = 10


def _active_dishes(restaurant_id: str) -> list[dict[str, Any]]:
    dishes = find_many(
        "dishes",
        restaurant_id,
        {"name": 1, "slug": 1, "sellPrice": 1, "recipeStatus": 1, "classification": 1, "category": 1},
    )
    return [d for d in dishes if str(d.get("recipeStatus", "new")) == "active"]


def _processed_sales(restaurant_id: str) -> list[dict[str, Any]]:
    return find_many(
        "salesorders",
        restaurant_id,
        {"saleDate": 1, "uploadDate": 1, "items": 1, "status": 1},
        extra_filter={"status": "processed"},
    )


def _dish_sales_counts(
    restaurant_id: str,
    window: FinancePeriodRange,
    *,
    order: Literal["most", "least"] = "most",
    limit: int = RANKING_LIMIT,
) -> list[tuple[str, str, float]]:
    active = _active_dishes(restaurant_id)
    if not active:
        return []
    sold_by_slug = {str(d.get("slug", "")): 0.0 for d in active}
    name_by_slug = {str(d.get("slug", "")): str(d.get("name", "dish")) for d in active}

    for order_row in _processed_sales(restaurant_id):
        if not order_in_period(order_row, window):
            continue
        for item in order_row.get("items") or []:
            if item.get("itemKind") == "addon" or item.get("addOnSlug"):
                continue
            slug = str(item.get("dishSlug") or "")
            if slug not in sold_by_slug:
                continue
            sold_by_slug[slug] += float(item.get("qty", 0) or 0)

    ranked = sorted(sold_by_slug.items(), key=lambda row: row[1], reverse=(order == "most"))
    if order == "least":
        ranked = sorted(sold_by_slug.items(), key=lambda row: row[1])
    return [(slug, name_by_slug.get(slug, slug), qty) for slug, qty in ranked[:limit]]


def format_dish_sales_ranking(
    restaurant_id: str,
    finance_period: str,
    *,
    order: Literal["most", "least"] = "most",
    limit: int = RANKING_LIMIT,
) -> str:
    period = parse_finance_period(finance_period)
    window = finance_period_range(period)
    rows = _dish_sales_counts(restaurant_id, window, order=order, limit=limit)
    if not rows:
        return "No processed sales for active menu dishes in this period."
    label = "Top selling" if order == "most" else "Slowest selling"
    return f"{label} active dishes ({window.label}):\n" + "\n".join(
        f"- {name} ({slug}): {qty:.0f} sold" for slug, name, qty in rows
    )


def _recipe_maps(restaurant_id: str) -> tuple[dict[str, dict], dict[str, dict]]:
    recipes = find_many(
        "recipes",
        restaurant_id,
        {
            "kind": 1,
            "targetSlug": 1,
            "dishSlug": 1,
            "ingredients": 1,
            "foodCost": 1,
            "sellPrice": 1,
            "dishName": 1,
        },
    )
    by_key: dict[str, dict] = {}
    dish_recipe: dict[str, dict] = {}
    for recipe in recipes:
        kind = str(recipe.get("kind", "dish"))
        target = str(recipe.get("targetSlug") or recipe.get("dishSlug") or "")
        if target:
            by_key[f"{kind}:{target}"] = recipe
        dish_slug = str(recipe.get("dishSlug") or recipe.get("targetSlug") or "")
        if kind == "dish" and dish_slug:
            dish_recipe[dish_slug] = recipe
    return by_key, dish_recipe


def _ingredient_usage_by_slug(
    restaurant_id: str,
    window: FinancePeriodRange,
) -> dict[str, float]:
    dishes = find_many(
        "dishes",
        restaurant_id,
        {"slug": 1, "ingredientLinks": 1},
    )
    dish_by_slug = {str(d.get("slug", "")): d for d in dishes}
    recipe_by_key, _ = _recipe_maps(restaurant_id)
    used_by_slug: dict[str, float] = {}

    for order_row in _processed_sales(restaurant_id):
        if not order_in_period(order_row, window):
            continue
        for item in order_row.get("items") or []:
            is_addon = item.get("itemKind") == "addon" or bool(item.get("addOnSlug"))
            slug = str(item.get("addOnSlug") if is_addon else item.get("dishSlug") or "")
            if not slug:
                continue
            kind = "addon" if is_addon else "dish"
            recipe = recipe_by_key.get(f"{kind}:{slug}")
            links: list[dict[str, Any]] = []
            if recipe:
                links = recipe.get("ingredients") or []
            elif not is_addon:
                dish = dish_by_slug.get(slug)
                links = (dish or {}).get("ingredientLinks") or []

            qty_sold = float(item.get("qty", 0) or 0)
            for link in links:
                ing_slug = str(link.get("ingredientSlug") or "")
                per_serving = float(link.get("qtyUsed") or link.get("qtyPerServing") or 0)
                if not ing_slug or per_serving <= 0:
                    continue
                used_by_slug[ing_slug] = used_by_slug.get(ing_slug, 0.0) + per_serving * qty_sold
    return used_by_slug


def format_top_used_ingredients(
    restaurant_id: str,
    finance_period: str,
    *,
    limit: int = RANKING_LIMIT,
) -> str:
    period = parse_finance_period(finance_period)
    window = finance_period_range(period)
    ingredients = find_many(
        "ingredients",
        restaurant_id,
        {"slug": 1, "name": 1, "inventoryUnit": 1},
    )
    ing_by_slug = {str(i.get("slug", "")): i for i in ingredients}
    used_by_slug = _ingredient_usage_by_slug(restaurant_id, window)

    if not used_by_slug:
        return f"No ingredient usage from processed sales in {window.label}."

    ranked = sorted(used_by_slug.items(), key=lambda row: row[1], reverse=True)[:limit]
    lines = []
    for slug, qty in ranked:
        ing = ing_by_slug.get(slug)
        if not ing:
            continue
        unit = str(ing.get("inventoryUnit") or "each")
        lines.append(f"- {ing['name']} ({slug}): {qty:.2f} {unit} used")
    if not lines:
        return "No matching pantry rows for sold ingredient usage."
    return f"Top used ingredients ({window.label}):\n" + "\n".join(lines)


def _dish_margin_pct(restaurant_id: str, dish: dict[str, Any], dish_recipe: dict[str, dict]) -> float | None:
    slug = str(dish.get("slug", ""))
    recipe = dish_recipe.get(slug)
    sell = float(dish.get("sellPrice") or (recipe.get("sellPrice") if recipe else 0) or 0)
    cost = float(recipe.get("foodCost", 0) if recipe else 0)
    if sell <= 0 or cost <= 0:
        return None
    return (sell - cost) / sell * 100


def format_promotion_opportunities(restaurant_id: str, finance_period: str) -> str:
    period = parse_finance_period(finance_period)
    window = finance_period_range(period)
    _, dish_recipe = _recipe_maps(restaurant_id)
    active = _active_dishes(restaurant_id)
    if not active:
        return "No active menu dishes to analyze."

    slow = _dish_sales_counts(restaurant_id, window, order="least", limit=5)
    slow_slugs = {slug for slug, _, _ in slow}

    lines: list[str] = []
    for dish in active:
        slug = str(dish.get("slug", ""))
        name = str(dish.get("name", "dish"))
        margin_pct = _dish_margin_pct(restaurant_id, dish, dish_recipe)
        sold = next((qty for s, _, qty in slow if s == slug), None)
        is_slow = slug in slow_slugs

        if margin_pct is not None and margin_pct < TARGET_MARGIN_PCT:
            lines.append(
                f"- **{name}** ({slug}): margin {margin_pct:.0f}% — "
                "run suggest_price_change; consider a price reset before promoting."
            )
        elif is_slow and sold is not None:
            lines.append(
                f"- **{name}** ({slug}): only {sold:.0f} sold — "
                "promotion candidate (bundle, feature, or limited-time special)."
            )

    if not lines:
        return f"No clear promotion or price-reset candidates for {window.label}."
    header = f"Promotion & pricing opportunities ({window.label}):\n"
    return header + "\n".join(lines[:8])


def format_suggest_reorder_threshold(
    restaurant_id: str,
    finance_period: str,
    *,
    slug: str = "",
    name: str = "",
    limit: int = 8,
) -> str:
    period = parse_finance_period(finance_period)
    window = finance_period_range(period)
    ingredients = find_many(
        "ingredients",
        restaurant_id,
        {
            "name": 1,
            "slug": 1,
            "currentQty": 1,
            "reorderThreshold": 1,
            "inventoryUnit": 1,
        },
    )
    used_by_slug = _ingredient_usage_by_slug(restaurant_id, window)

    def advise(ing: dict[str, Any]) -> str | None:
        ing_slug = str(ing.get("slug", ""))
        used = used_by_slug.get(ing_slug, 0.0)
        if used <= 0:
            return None
        current = float(ing.get("reorderThreshold", 0) or 0)
        # Cover ~1 week of usage at observed period velocity (scale to 7-day week).
        days = max((window.end - window.start).days + 1, 1)
        weekly_usage = used * (7.0 / days)
        suggested = max(1.0, round(weekly_usage * 1.25, 1))
        if abs(suggested - current) < 0.5:
            return None
        unit = str(ing.get("inventoryUnit") or "each")
        on_hand = float(ing.get("currentQty", 0) or 0)
        return (
            f"- **{ing['name']}** ({ing_slug}): on hand {on_hand} {unit}, "
            f"reorder now {current} → suggested **{suggested:.1f}** "
            f"(~{weekly_usage:.1f} {unit}/week from sales). "
            "Confirm with Inventory update_reorder_threshold."
        )

    if slug.strip() or name.strip():
        ing = resolve_ingredient_slug(restaurant_id, slug=slug, name=name)
        if not ing:
            return "Ingredient not found — provide slug or name."
        line = advise(ing)
        if not line:
            return (
                f"**{ing['name']}** — current reorder threshold "
                f"({ing.get('reorderThreshold', 0)}) looks reasonable for recent usage."
            )
        return f"Reorder threshold advice ({window.label}):\n{line}"

    lines: list[str] = []
    for ing in ingredients:
        line = advise(ing)
        if line:
            lines.append(line)
        if len(lines) >= limit:
            break
    if not lines:
        return "No reorder threshold changes recommended from recent sales velocity."
    return f"Reorder threshold recommendations ({window.label}):\n" + "\n".join(lines)


def format_suggest_price_change(restaurant_id: str, *, slug: str = "", name: str = "") -> str:
    return suggest_price_change_text(restaurant_id, slug=slug, name=name)
