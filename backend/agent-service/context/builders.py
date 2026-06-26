# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# """Kitchen data context builders — mirrors dashboard-chat-context.ts."""
#
# from __future__ import annotations
#
# from datetime import datetime, timedelta
#
# from context.finance import finance_period_range, line_total, order_in_period, parse_finance_period
# from db.mongo import find_many
#
# EXPIRING_WITHIN_MS = 7 * 86400000
#
#
# def _is_expiring(ingredient: dict, now: datetime | None = None) -> bool:
#     expiry = ingredient.get("expiryDate")
#     if not expiry:
#         return False
#     if isinstance(expiry, str):
#         try:
#             expiry_dt = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
#         except ValueError:
#             return False
#     else:
#         expiry_dt = expiry
#     if expiry_dt.tzinfo is not None:
#         expiry_dt = expiry_dt.replace(tzinfo=None)
#     ref = now or datetime.now()
#     return expiry_dt <= ref + timedelta(milliseconds=EXPIRING_WITHIN_MS)
#
#
# def _is_low_stock(ingredient: dict) -> bool:
#     threshold = float(ingredient.get("reorderThreshold", 0) or 0)
#     qty = float(ingredient.get("currentQty", 0) or 0)
#     return qty <= threshold
#
#
# def build_inventory_context(restaurant_id: str) -> str:
#     ingredients = find_many(
#         "ingredients",
#         restaurant_id,
#         {
#             "name": 1,
#             "slug": 1,
#             "category": 1,
#             "currentQty": 1,
#             "reorderThreshold": 1,
#             "inventoryUnit": 1,
#             "expiryDate": 1,
#         },
#     )
#     low = [i for i in ingredients if _is_low_stock(i)]
#     expiring = [i for i in ingredients if _is_expiring(i)]
#     by_category: dict[str, int] = {}
#     for ing in ingredients:
#         cat = str(ing.get("category") or "other")
#         by_category[cat] = by_category.get(cat, 0) + 1
#
#     category_lines = ", ".join(f"{cat}: {count}" for cat, count in by_category.items())
#     low_lines = "; ".join(
#         f"{i['name']} — {i.get('currentQty', 0)} {i.get('inventoryUnit', 'each')} "
#         f"(reorder {i.get('reorderThreshold', 0)})"
#         for i in low[:12]
#     )
#     expiring_lines = "; ".join(
#         f"{i['name']} — {i.get('currentQty', 0)} {i.get('inventoryUnit', 'each')}"
#         for i in expiring
#     )
#
#     return "\n".join(
#         [
#             f"Total ingredients: {len(ingredients)}",
#             f"Categories: {category_lines or 'none'}",
#             f"Low / required ({len(low)}): {low_lines or 'none'}",
#             f"Expiring within 7 days ({len(expiring)}): {expiring_lines or 'none'}",
#         ]
#     )
#
#
# def build_business_context(restaurant_id: str, finance_period: str = "week") -> str:
#     period = parse_finance_period(finance_period)
#     window = finance_period_range(period)
#
#     sales_orders = find_many(
#         "salesorders",
#         restaurant_id,
#         {"saleDate": 1, "uploadDate": 1, "items": 1, "status": 1},
#         extra_filter={"status": "processed"},
#     )
#     purchase_orders = find_many(
#         "purchaseorders",
#         restaurant_id,
#         {"purchaseDate": 1, "uploadDate": 1, "items": 1, "status": 1},
#         extra_filter={"status": "processed"},
#     )
#     dishes = find_many("dishes", restaurant_id, {"name": 1, "slug": 1, "recipeStatus": 1, "sellPrice": 1})
#     recipes = find_many(
#         "recipes",
#         restaurant_id,
#         {"foodCost": 1, "targetSlug": 1, "dishSlug": 1, "progress": 1, "kind": 1},
#         extra_filter={"progress": "ready", "kind": "dish"},
#     )
#     cost_by_slug: dict[str, float] = {}
#     for recipe in recipes:
#         slug = str(recipe.get("dishSlug") or recipe.get("targetSlug") or "")
#         if slug:
#             cost_by_slug[slug] = float(recipe.get("foodCost", 0) or 0)
#     sell_by_slug = {str(d.get("slug", "")): float(d.get("sellPrice", 0) or 0) for d in dishes}
#
#     sales = 0.0
#     items_sold = 0
#     tickets = 0
#     for order in sales_orders:
#         if not order_in_period(order, window):
#             continue
#         tickets += 1
#         for item in order.get("items") or []:
#             sales += line_total(item)
#             items_sold += int(item.get("qty", 0) or 0)
#
#     purchases = 0.0
#     for order in purchase_orders:
#         if not order_in_period(order, window):
#             continue
#         for item in order.get("items") or []:
#             purchases += line_total(item)
#
#     sold_cogs = 0.0
#     for order in sales_orders:
#         if not order_in_period(order, window):
#             continue
#         for item in order.get("items") or []:
#             food_cost = float(item.get("foodCost", 0) or 0)
#             sold_cogs += food_cost * float(item.get("qty", 0) or 0)
#
#     gross_profit = sales - sold_cogs
#     margin_pct = (gross_profit / sales * 100) if sales > 0 else 0.0
#
#     top_margins = sorted(
#         (
#             {
#                 "name": str(d.get("name", "dish")),
#                 "sell": sell_by_slug.get(str(d.get("slug", "")), 0.0),
#                 "margin": sell_by_slug.get(str(d.get("slug", "")), 0.0)
#                 - cost_by_slug.get(str(d.get("slug", "")), 0.0),
#                 "pct": (
#                     (
#                         (
#                             sell_by_slug.get(str(d.get("slug", "")), 0.0)
#                             - cost_by_slug.get(str(d.get("slug", "")), 0.0)
#                         )
#                         / sell_by_slug.get(str(d.get("slug", "")), 1)
#                     )
#                     * 100
#                     if sell_by_slug.get(str(d.get("slug", "")), 0.0) > 0
#                     else 0
#                 ),
#             }
#             for d in dishes
#             if sell_by_slug.get(str(d.get("slug", "")), 0.0) > 0
#             and cost_by_slug.get(str(d.get("slug", "")), 0.0) > 0
#         ),
#         key=lambda row: row["margin"],
#         reverse=True,
#     )[:5]
#     top_margin_line = "; ".join(
#         f"{r['name']} sell ${r['sell']:.2f} margin ${r['margin']:.2f} ({r['pct']:.0f}%)"
#         for r in top_margins
#     )
#
#     active_dishes = sum(1 for d in dishes if (d.get("recipeStatus") or "new") == "active")
#
#     return "\n".join(
#         [
#             f"Period: {window.label}",
#             f"POS sales: ${sales:.0f} ({tickets} tickets, {items_sold} items)",
#             f"COGS (sold): ${sold_cogs:.0f}",
#             f"Gross profit: ${gross_profit:.0f} ({margin_pct:.1f}%)",
#             f"Supplier purchases: ${purchases:.0f} (bulk restocks — not same as COGS)",
#             f"Active dishes: {active_dishes}",
#             f"Top margins per serving: {top_margin_line or 'no priced recipes yet'}",
#         ]
#     )
#
#
# def build_head_context(restaurant_id: str, finance_period: str = "week") -> str:
#     inventory = build_inventory_context(restaurant_id)
#     business = build_business_context(restaurant_id, finance_period)
#     return f"Inventory snapshot:\n{inventory}\n\nBusiness snapshot:\n{business}"
#
#
# def build_creative_context(restaurant_id: str, cues_text: str = "") -> str:
#     ingredients = find_many(
#         "ingredients",
#         restaurant_id,
#         {"slug": 1, "name": 1, "category": 1, "currentQty": 1, "inventoryUnit": 1, "expiryDate": 1},
#     )
#     dishes = find_many(
#         "dishes",
#         restaurant_id,
#         {"slug": 1, "name": 1, "classification": 1, "recipeStatus": 1, "sellPrice": 1},
#     )
#     recipes = find_many(
#         "recipes",
#         restaurant_id,
#         {"foodCost": 1, "targetSlug": 1, "dishSlug": 1, "ingredients": 1, "progress": 1, "kind": 1},
#         extra_filter={"progress": "ready", "kind": "dish"},
#     )
#     sell_by_slug = {str(d.get("slug", "")): float(d.get("sellPrice", 0) or 0) for d in dishes}
#
#     expiring = [i for i in ingredients if _is_expiring(i)]
#     expiring_lines = "\n".join(
#         f"{i['name']} ({i.get('slug', '')}) — {i.get('currentQty', 0)} {i.get('inventoryUnit', 'each')}"
#         for i in expiring
#     ) or "None"
#
#     top_margin_recipes = sorted(
#         (
#             {
#                 "margin_pct": (
#                     (
#                         sell_by_slug.get(
#                             str(r.get("dishSlug") or r.get("targetSlug") or ""), 0.0
#                         )
#                         - float(r.get("foodCost", 0) or 0)
#                     )
#                     / sell_by_slug.get(
#                         str(r.get("dishSlug") or r.get("targetSlug") or ""), 1
#                     )
#                 )
#                 * 100
#                 if sell_by_slug.get(str(r.get("dishSlug") or r.get("targetSlug") or ""), 0.0)
#                 > 0
#                 else 0,
#                 "ingredients": r.get("ingredients") or [],
#             }
#             for r in recipes
#             if float(r.get("foodCost", 0) or 0) > 0
#             and sell_by_slug.get(str(r.get("dishSlug") or r.get("targetSlug") or ""), 0.0) > 0
#         ),
#         key=lambda row: row["margin_pct"],
#         reverse=True,
#     )[:5]
#
#     high_margin_names: list[str] = []
#     for recipe in top_margin_recipes:
#         for ing in recipe["ingredients"]:
#             if len(high_margin_names) >= 12:
#                 break
#             name = f"{ing.get('ingredientName', '')} ({ing.get('ingredientSlug', '')})"
#             if name.strip() and name not in high_margin_names:
#                 high_margin_names.append(name)
#
#     pantry = "\n".join(
#         f"{i['name']} ({i.get('slug', '')}, {i.get('category', '')}, "
#         f"on hand {i.get('currentQty', 0)} {i.get('inventoryUnit', 'each')}, "
#         f"reorder {i.get('reorderThreshold', 0)})"
#         for i in ingredients[:40]
#     ) or "Empty"
#
#     active = "\n".join(
#         f"{d['name']} — ${float(d.get('sellPrice', 0) or 0):.2f}"
#         for d in dishes
#         if (d.get("recipeStatus") or "new") == "active"
#     ) or "None"
#
#     suggested = ", ".join(d["name"] for d in dishes if d.get("recipeStatus") == "suggested") or "None"
#
#     cues_block = f"Context cues:\n{cues_text}" if cues_text else "Context cues: (none provided)"
#
#     return "\n".join(
#         [
#             cues_block,
#             f"\nExpiring within 7 days:\n{expiring_lines}",
#             f"\nHigh-margin ingredients (from top dishes):\n"
#             + ("\n".join(high_margin_names) if high_margin_names else "No priced recipes yet"),
#             f"\nPantry (sample):\n{pantry}",
#             f"\nActive menu:\n{active}",
#             f"\nExisting suggestions: {suggested}",
#         ]
#     )
