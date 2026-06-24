"""Menu read helpers for apply_menu and apply_business internal actions."""

from __future__ import annotations

from db.mongo import find_many, find_one


def resolve_dish_slug(restaurant_id: str, slug: str = "", name: str = "") -> dict | None:
    key = (slug or name).strip().lower()
    if not key:
        return None
    if slug.strip():
        row = find_one(
            "dishes",
            restaurant_id,
            {"slug": slug.strip().lower()},
            {"name": 1, "slug": 1, "sellPrice": 1, "description": 1, "classification": 1},
        )
        if row:
            return row
    dishes = find_many(
        "dishes",
        restaurant_id,
        {"name": 1, "slug": 1, "sellPrice": 1, "description": 1, "classification": 1},
    )
    matches = [d for d in dishes if key in str(d.get("name", "")).lower() or key == str(d.get("slug", "")).lower()]
    if len(matches) == 1:
        return matches[0]
    return None


def suggest_price_change_text(restaurant_id: str, slug: str = "", name: str = "") -> str:
    dish = resolve_dish_slug(restaurant_id, slug=slug, name=name)
    if not dish:
        return "Provide a dish slug or name to analyze pricing."
    dish_slug = str(dish.get("slug", ""))
    recipes = find_many(
        "recipes",
        restaurant_id,
        {"dishName": 1, "foodCost": 1, "sellPrice": 1, "dishSlug": 1, "kind": 1},
        extra_filter={"kind": "dish"},
    )
    recipe = next(
        (r for r in recipes if str(r.get("dishSlug", "")) == dish_slug or str(r.get("dishName", "")).lower() == str(dish.get("name", "")).lower()),
        None,
    )
    sell = float(dish.get("sellPrice") or (recipe.get("sellPrice") if recipe else 0) or 0)
    cost = float(recipe.get("foodCost", 0) if recipe else 0)
    if sell <= 0:
        return f"**{dish['name']}** has no sell price set yet — add pricing in Kitchen control first."
    if cost <= 0:
        return (
            f"**{dish['name']}** sells at ${sell:.2f} but food cost is unknown (recipe not ready). "
            "Link ingredients in Recipes before tuning price."
        )
    margin = sell - cost
    pct = margin / sell * 100
    target_pct = 65.0
    suggested = round(cost / (1 - target_pct / 100), 2)
    if pct >= target_pct:
        return (
            f"**{dish['name']}**: ${sell:.2f} sell · ${cost:.2f} cost · "
            f"${margin:.2f} margin ({pct:.0f}%) — healthy; no change needed."
        )
    return (
        f"**{dish['name']}**: ${sell:.2f} sell · ${cost:.2f} cost · "
        f"${margin:.2f} margin ({pct:.0f}%) — below target.\n"
        f"Suggested price for ~{target_pct:.0f}% margin: **${suggested:.2f}**. "
        "Call apply_business action apply_price_change after the chef confirms."
    )


def resolve_ingredient_slug(restaurant_id: str, slug: str) -> dict | None:
    key = slug.strip().lower()
    if not key:
        return None
    return find_one(
        "ingredients",
        restaurant_id,
        {"slug": key},
        {"name": 1, "slug": 1, "inventoryUnit": 1},
    )
