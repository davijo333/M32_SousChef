# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# """Menu read helpers for apply_menu and apply_business internal actions."""
#
# from __future__ import annotations
#
# import re
#
# from db.mongo import find_many, find_one
#
#
# def addon_slug_from_name(name: str) -> str:
#     slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
#     return f"addon-{slug}"
#
#
# def resolve_dish_slug(restaurant_id: str, slug: str = "", name: str = "") -> dict | None:
#     key = (slug or name).strip().lower()
#     if not key:
#         return None
#     if slug.strip():
#         row = find_one(
#             "dishes",
#             restaurant_id,
#             {"slug": slug.strip().lower()},
#             {"name": 1, "slug": 1, "sellPrice": 1, "description": 1, "classification": 1, "recipeStatus": 1},
#         )
#         if row:
#             return row
#     dishes = find_many(
#         "dishes",
#         restaurant_id,
#         {"name": 1, "slug": 1, "sellPrice": 1, "description": 1, "classification": 1, "recipeStatus": 1},
#     )
#     matches = [d for d in dishes if key in str(d.get("name", "")).lower() or key == str(d.get("slug", "")).lower()]
#     if len(matches) == 1:
#         return matches[0]
#     if not matches and name.strip():
#         from tools.core.catalog_lookup import search_dishes
#
#         hits = search_dishes(restaurant_id, name.strip(), limit=1)
#         if len(hits) == 1:
#             return hits[0]
#     return None
#
#
# def resolve_addon_slug(restaurant_id: str, slug: str = "", name: str = "") -> dict | None:
#     key = (slug or name).strip().lower()
#     if not key:
#         return None
#     if slug.strip():
#         row = find_one(
#             "addons",
#             restaurant_id,
#             {"slug": slug.strip().lower()},
#             {"name": 1, "slug": 1, "sellPrice": 1, "description": 1, "classification": 1, "recipeStatus": 1},
#         )
#         if row:
#             return row
#     addons = find_many(
#         "addons",
#         restaurant_id,
#         {"name": 1, "slug": 1, "sellPrice": 1, "description": 1, "classification": 1, "recipeStatus": 1},
#     )
#     matches = [
#         row
#         for row in addons
#         if key in str(row.get("name", "")).lower() or key == str(row.get("slug", "")).lower()
#     ]
#     if len(matches) == 1:
#         return matches[0]
#     return None
#
#
# def suggest_price_change_text(restaurant_id: str, slug: str = "", name: str = "") -> str:
#     from tools.core.menu_pricing import format_dish_pricing_text
#
#     return format_dish_pricing_text(restaurant_id, slug=slug, name=name)
#
#
# _INGREDIENT_LOOKUP_FIELDS = {
#     "name": 1,
#     "slug": 1,
#     "inventoryUnit": 1,
#     "currentQty": 1,
#     "reorderThreshold": 1,
#     "category": 1,
#     "label": 1,
#     "brandName": 1,
#     "expiryDate": 1,
# }
#
#
# def resolve_ingredient_slug(restaurant_id: str, slug: str = "", name: str = "") -> dict | None:
#     key = (slug or name).strip().lower()
#     if not key:
#         return None
#     if slug.strip():
#         row = find_one(
#             "ingredients",
#             restaurant_id,
#             {"slug": slug.strip().lower()},
#             _INGREDIENT_LOOKUP_FIELDS,
#         )
#         if row:
#             return row
#     ingredients = find_many(
#         "ingredients",
#         restaurant_id,
#         _INGREDIENT_LOOKUP_FIELDS,
#     )
#     matches = [
#         ing
#         for ing in ingredients
#         if key in str(ing.get("name", "")).lower() or key == str(ing.get("slug", "")).lower()
#     ]
#     if len(matches) == 1:
#         return matches[0]
#     from tools.core.catalog_lookup import search_ingredients
#
#     hits = search_ingredients(restaurant_id, name.strip() or slug.strip(), limit=2)
#     if len(hits) == 1:
#         return hits[0]
#     return None
#
#
# def resolve_ingredient_slugs(restaurant_id: str, slugs_or_names: list[str]) -> tuple[list[str], list[str]]:
#     """Resolve pantry slugs; return (resolved_slugs, missing_tokens)."""
#     resolved: list[str] = []
#     missing: list[str] = []
#     for token in slugs_or_names:
#         key = token.strip()
#         if not key:
#             continue
#         ing = resolve_ingredient_slug(restaurant_id, slug=key, name=key)
#         if ing:
#             resolved.append(str(ing.get("slug", key)).lower())
#         else:
#             missing.append(key)
#     return resolved, missing
#
#
# def ingredient_tokens_for_pending(restaurant_id: str, tokens: list[str]) -> tuple[list[str], list[str]]:
#     """Slugs for known pantry rows; preserve names for missing (auto-created on confirm)."""
#     pending: list[str] = []
#     missing: list[str] = []
#     for token in tokens:
#         key = token.strip()
#         if not key:
#             continue
#         ing = resolve_ingredient_slug(restaurant_id, slug=key, name=key)
#         if ing:
#             pending.append(str(ing.get("slug", key)).lower())
#         else:
#             pending.append(key)
#             missing.append(key)
#     return pending, missing
