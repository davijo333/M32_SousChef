"""Pantry and menu duplicate / similar-item checks before catalog writes."""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Any, Literal

from db.mongo import find_many
from tools.core.menu_actions import resolve_addon_slug, resolve_dish_slug, resolve_ingredient_slug

CatalogKind = Literal["ingredient", "dish", "addon"]


def _norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def _score(query: str, candidate: str) -> float:
    if not query or not candidate:
        return 0.0
    q = _norm(query)
    c = _norm(candidate)
    if not q or not c:
        return 0.0
    if q == c or q in c or c in q:
        return 0.95
    return SequenceMatcher(None, q, c).ratio()


def _search_rows(
    rows: list[dict[str, Any]],
    query: str,
    *,
    limit: int = 5,
    min_score: float = 0.55,
) -> list[tuple[float, dict[str, Any]]]:
    scored: list[tuple[float, dict[str, Any]]] = []
    for row in rows:
        name = str(row.get("name", ""))
        slug = str(row.get("slug", ""))
        score = max(_score(query, name), _score(query, slug))
        if score >= min_score:
            scored.append((score, row))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return scored[:limit]


def search_ingredients(restaurant_id: str, query: str, *, limit: int = 5) -> list[dict[str, Any]]:
    if not query.strip():
        return []
    rows = find_many(
        "ingredients",
        restaurant_id,
        {
            "name": 1,
            "slug": 1,
            "category": 1,
            "currentQty": 1,
            "inventoryUnit": 1,
            "reorderThreshold": 1,
            "label": 1,
            "brandName": 1,
        },
    )
    return [row for _, row in _search_rows(rows, query, limit=limit)]


def search_dishes(restaurant_id: str, query: str, *, limit: int = 5) -> list[dict[str, Any]]:
    if not query.strip():
        return []
    rows = find_many(
        "dishes",
        restaurant_id,
        {
            "name": 1,
            "slug": 1,
            "classification": 1,
            "category": 1,
            "sellPrice": 1,
            "description": 1,
        },
    )
    return [row for _, row in _search_rows(rows, query, limit=limit)]


def format_ingredient_summary(ing: dict[str, Any]) -> str:
    label = ing.get("label")
    label_bit = f", label **{label}**" if label else ""
    brand = ing.get("brandName")
    brand_bit = f", brand {brand}" if brand else ""
    qty = float(ing.get("currentQty", 0) or 0)
    threshold = float(ing.get("reorderThreshold", 0) or 0)
    unit = str(ing.get("inventoryUnit") or "each")
    return (
        f"**{ing.get('name', '')}** (`{ing.get('slug', '')}`) — "
        f"on hand **{qty:g} {unit}**, reorder level **{threshold:g}**, "
        f"category {ing.get('category', '')}"
        f"{brand_bit}{label_bit}"
    )


def format_dish_summary(dish: dict[str, Any]) -> str:
    classification = dish.get("classification") or dish.get("category") or "other"
    sell = float(dish.get("sellPrice") or 0)
    price_bit = f", sell **${sell:.2f}**" if sell > 0 else ""
    return (
        f"**{dish.get('name', '')}** (`{dish.get('slug', '')}`) — "
        f"{classification}{price_bit}"
    )


def format_addon_summary(addon: dict[str, Any]) -> str:
    classification = addon.get("classification") or "addon"
    sell = float(addon.get("sellPrice") or 0)
    price_bit = f", sell **${sell:.2f}**" if sell > 0 else ""
    return (
        f"**{addon.get('name', '')}** (`{addon.get('slug', '')}`) — "
        f"add-on, {classification}{price_bit}"
    )


def search_addons(restaurant_id: str, query: str, *, limit: int = 5) -> list[dict[str, Any]]:
    if not query.strip():
        return []
    rows = find_many(
        "addons",
        restaurant_id,
        {
            "name": 1,
            "slug": 1,
            "classification": 1,
            "sellPrice": 1,
            "description": 1,
        },
    )
    return [row for _, row in _search_rows(rows, query, limit=limit)]


def check_create_ingredient(
    restaurant_id: str,
    name: str,
    *,
    brand_name: str = "",
) -> dict[str, Any]:
    exact = resolve_ingredient_slug(restaurant_id, name=name)
    if exact and _score(name, str(exact.get("name", ""))) >= 0.92:
        return {"exact": exact, "similar": []}
    similar = search_ingredients(restaurant_id, name, limit=5)
    if brand_name.strip():
        brand_hits = [
            row
            for row in similar
            if brand_name.strip().lower() in str(row.get("brandName", "")).lower()
        ]
        if brand_hits:
            similar = brand_hits + [row for row in similar if row not in brand_hits]
    similar = [row for row in similar if row.get("slug") != (exact or {}).get("slug")]
    return {"exact": exact if exact and _score(name, str(exact.get("name", ""))) >= 0.92 else None, "similar": similar}


def check_create_dish(restaurant_id: str, name: str) -> dict[str, Any]:
    exact = resolve_dish_slug(restaurant_id, name=name)
    if exact and _score(name, str(exact.get("name", ""))) >= 0.92:
        return {"exact": exact, "similar": []}
    similar = search_dishes(restaurant_id, name, limit=5)
    similar = [row for row in similar if row.get("slug") != (exact or {}).get("slug")]
    return {"exact": exact if exact and _score(name, str(exact.get("name", ""))) >= 0.92 else None, "similar": similar}


def check_create_addon(restaurant_id: str, name: str) -> dict[str, Any]:
    exact = resolve_addon_slug(restaurant_id, name=name)
    if exact and _score(name, str(exact.get("name", ""))) >= 0.92:
        return {"exact": exact, "similar": []}
    similar = search_addons(restaurant_id, name, limit=5)
    similar = [row for row in similar if row.get("slug") != (exact or {}).get("slug")]
    return {"exact": exact if exact and _score(name, str(exact.get("name", ""))) >= 0.92 else None, "similar": similar}


def check_update_ingredient(
    restaurant_id: str,
    *,
    slug: str = "",
    name: str = "",
) -> dict[str, Any]:
    found = resolve_ingredient_slug(restaurant_id, slug=slug, name=name)
    if found:
        return {"found": found, "similar": []}
    query = slug.strip() or name.strip()
    similar = search_ingredients(restaurant_id, query, limit=5) if query else []
    return {"found": None, "similar": similar}


def check_update_dish(
    restaurant_id: str,
    *,
    slug: str = "",
    name: str = "",
) -> dict[str, Any]:
    found = resolve_dish_slug(restaurant_id, slug=slug, name=name)
    if found:
        return {"found": found, "similar": []}
    query = slug.strip() or name.strip()
    similar = search_dishes(restaurant_id, query, limit=5) if query else []
    return {"found": None, "similar": similar}


def check_update_addon(
    restaurant_id: str,
    *,
    slug: str = "",
    name: str = "",
) -> dict[str, Any]:
    found = resolve_addon_slug(restaurant_id, slug=slug, name=name)
    if found:
        return {"found": found, "similar": []}
    query = slug.strip() or name.strip()
    similar = search_addons(restaurant_id, query, limit=5) if query else []
    return {"found": None, "similar": similar}


def format_create_collision(kind: CatalogKind, name: str, lookup: dict[str, Any]) -> str | None:
    exact = lookup.get("exact")
    similar: list[dict[str, Any]] = lookup.get("similar") or []
    if kind == "ingredient":
        formatter = format_ingredient_summary
        noun = "pantry item"
    elif kind == "addon":
        formatter = format_addon_summary
        noun = "add-on"
    else:
        formatter = format_dish_summary
        noun = "dish"

    if exact:
        return (
            f"That {noun} **already exists** — no need to add:\n"
            f"{formatter(exact)}\n\n"
            f"Use **update_{kind}** to change it, or give a different name to create something new."
        )
    if similar:
        lines = "\n".join(f"- {formatter(row)}" for row in similar[:5])
        return (
            f"Before creating **{name}**, similar {noun}s are already in the kitchen:\n{lines}\n\n"
            "Confirm this is a **new** item, or tell me which existing one to update instead."
        )
    return None


def format_update_miss(kind: CatalogKind, query: str, lookup: dict[str, Any]) -> str | None:
    similar: list[dict[str, Any]] = lookup.get("similar") or []
    if not similar:
        browse = "query_inventory" if kind == "ingredient" else "query_menu"
        return f"No {kind} matching '{query}'. Use {browse} search to browse."
    if kind == "ingredient":
        formatter = format_ingredient_summary
    elif kind == "addon":
        formatter = format_addon_summary
    else:
        formatter = format_dish_summary
    lines = "\n".join(f"- {formatter(row)}" for row in similar[:5])
    return (
        f"No exact {kind} match for '{query}'. Did you mean:\n{lines}\n\n"
        "Reply with the slug or exact name to update."
    )
