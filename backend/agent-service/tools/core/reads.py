"""Internal read actions for consolidated query_* tools."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from context.builders import (
    build_business_context,
    build_creative_context,
    build_head_context,
    build_inventory_context,
)
from context.finance import finance_period_range, line_total, order_in_period, parse_finance_period
from db.mongo import find_many, find_one
from tools.core.bills import format_bill_queue, get_bill_summary

EXPIRING_WITHIN_MS = 7 * 86400000


def _is_expiring(ingredient: dict[str, Any], within_days: int = 7) -> bool:
    expiry = ingredient.get("expiryDate")
    if not expiry:
        return False
    if isinstance(expiry, str):
        try:
            expiry_dt = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
        except ValueError:
            return False
    else:
        expiry_dt = expiry
    if expiry_dt.tzinfo is not None:
        expiry_dt = expiry_dt.replace(tzinfo=None)
    cutoff = datetime.now() + timedelta(days=max(1, min(within_days, 30)))
    return expiry_dt <= cutoff


def _is_low_stock(ingredient: dict[str, Any]) -> bool:
    return float(ingredient.get("currentQty", 0) or 0) <= float(
        ingredient.get("reorderThreshold", 0) or 0
    )


# --- Inventory reads ---


def read_inventory(
    restaurant_id: str,
    action: str,
    *,
    user_id: str = "",
    query: str = "",
    slug: str = "",
    bill_id: str = "",
    bill_ids: list[str] | None = None,
    within_days: int = 7,
    limit: int = 15,
) -> str:
    act = action.strip().lower().replace("-", "_")
    if act in ("pantry_summary", "summary", "pantry"):
        return build_inventory_context(restaurant_id)
    if act in ("low_stock", "reorder"):
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
        low = [i for i in ingredients if _is_low_stock(i)][: max(1, min(limit, 30))]
        if not low:
            return "No ingredients are below reorder threshold."
        return "\n".join(
            f"- {i['name']} ({i.get('slug', '')}): {i.get('currentQty', 0)} "
            f"{i.get('inventoryUnit', 'each')} (reorder {i.get('reorderThreshold', 0)})"
            for i in low
        )
    if act in ("expiring", "expiry"):
        ingredients = find_many(
            "ingredients",
            restaurant_id,
            {"name": 1, "slug": 1, "currentQty": 1, "inventoryUnit": 1, "expiryDate": 1},
        )
        cutoff = datetime.now() + timedelta(days=max(1, min(within_days, 30)))
        expiring = []
        for ing in ingredients:
            expiry = ing.get("expiryDate")
            if not expiry:
                continue
            if isinstance(expiry, str):
                try:
                    expiry_dt = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
                except ValueError:
                    continue
            else:
                expiry_dt = expiry
            if expiry_dt.tzinfo is not None:
                expiry_dt = expiry_dt.replace(tzinfo=None)
            if expiry_dt <= cutoff:
                expiring.append((expiry_dt, ing))
        if not expiring:
            return f"No ingredients expiring within {within_days} days."
        expiring.sort(key=lambda row: row[0])
        return "\n".join(
            f"- {ing['name']} ({ing.get('slug', '')}): {ing.get('currentQty', 0)} "
            f"{ing.get('inventoryUnit', 'each')} — expires {dt.date().isoformat()}"
            for dt, ing in expiring[:20]
        )
    if act == "search":
        q = query.strip().lower()
        if not q:
            return "Provide a search query."
        ingredients = find_many(
            "ingredients",
            restaurant_id,
            {"name": 1, "slug": 1, "currentQty": 1, "inventoryUnit": 1, "category": 1},
        )
        matches = [
            i
            for i in ingredients
            if q in str(i.get("name", "")).lower() or q in str(i.get("slug", "")).lower()
        ][:15]
        if not matches:
            return f"No ingredients matching '{query}'."
        return "\n".join(
            f"- {i['name']} ({i.get('slug', '')}, {i.get('category', '')}): "
            f"{i.get('currentQty', 0)} {i.get('inventoryUnit', 'each')}"
            for i in matches
        )
    if act in ("ingredient_detail", "detail"):
        key = (slug or query).strip().lower()
        if not key:
            return "Provide slug or search query for ingredient_detail."
        ing = find_one(
            "ingredients",
            restaurant_id,
            {"slug": key},
            projection={
                "name": 1,
                "slug": 1,
                "category": 1,
                "currentQty": 1,
                "reorderThreshold": 1,
                "inventoryUnit": 1,
                "expiryDate": 1,
                "label": 1,
            },
        )
        if not ing:
            ingredients = find_many(
                "ingredients",
                restaurant_id,
                {
                    "name": 1,
                    "slug": 1,
                    "category": 1,
                    "currentQty": 1,
                    "reorderThreshold": 1,
                    "inventoryUnit": 1,
                    "expiryDate": 1,
                },
            )
            matches = [
                i
                for i in ingredients
                if key in str(i.get("name", "")).lower() or key in str(i.get("slug", "")).lower()
            ]
            if len(matches) == 1:
                ing = matches[0]
            elif matches:
                return "Multiple matches — use slug:\n" + "\n".join(
                    f"- {m['name']} ({m.get('slug', '')})" for m in matches[:8]
                )
        if not ing:
            return f"No ingredient matching '{slug or query}'."
        expiry = ing.get("expiryDate")
        expiry_str = ""
        if expiry:
            if isinstance(expiry, datetime):
                expiry_str = expiry.date().isoformat()
            else:
                expiry_str = str(expiry)[:10]
        low = _is_low_stock(ing)
        return (
            f"{ing['name']} ({ing.get('slug', '')})\n"
            f"Category: {ing.get('category', '')}\n"
            f"On hand: {ing.get('currentQty', 0)} {ing.get('inventoryUnit', 'each')}\n"
            f"Reorder threshold: {ing.get('reorderThreshold', 0)}"
            + (f"\nExpires: {expiry_str}" if expiry_str else "")
            + (f"\nLabel: {ing.get('label')}" if ing.get("label") else "")
            + ("\n⚠ Below reorder threshold." if low else "")
        )
    if act in ("purchase_queue", "purchase_parse_queue", "queue"):
        return format_bill_queue(
            user_id,
            bill_type="supplier",
            pending_only=True,
            bill_ids=bill_ids,
            limit=limit,
        )
    if act in ("purchase_bill_summary", "bill_summary"):
        if not bill_id:
            return "Provide bill_id for purchase_bill_summary."
        return get_bill_summary(restaurant_id, bill_id)
    return (
        "Unknown action. Use: pantry_summary, low_stock, expiring, search, "
        "ingredient_detail, purchase_queue, purchase_bill_summary."
    )


# --- Business reads ---


def read_business(
    restaurant_id: str,
    action: str,
    *,
    user_id: str = "",
    finance_period: str = "week",
    bill_id: str = "",
    bill_ids: list[str] | None = None,
    view: str = "highest",
    limit: int = 8,
    slug: str = "",
    dish_name: str = "",
) -> str:
    from tools.core import business_analytics

    act = action.strip().lower().replace("-", "_")
    period = parse_finance_period(finance_period)
    if act in ("finance_summary", "summary", "finance"):
        return build_business_context(restaurant_id, period)
    if act in ("top_selling", "top_sellers", "top_dishes"):
        return business_analytics.format_dish_sales_ranking(
            restaurant_id, finance_period, order="most", limit=limit
        )
    if act in ("slow_sellers", "slow_selling", "least_selling", "bottom_sellers"):
        return business_analytics.format_dish_sales_ranking(
            restaurant_id, finance_period, order="least", limit=limit
        )
    if act in ("top_used", "top_used_ingredients", "ingredient_usage"):
        return business_analytics.format_top_used_ingredients(
            restaurant_id, finance_period, limit=limit
        )
    if act in ("promotion_opportunities", "promotions", "promotion_candidates"):
        return business_analytics.format_promotion_opportunities(restaurant_id, finance_period)
    if act in ("suggest_reorder_threshold", "reorder_advice", "reorder_recommendation"):
        return business_analytics.format_suggest_reorder_threshold(
            restaurant_id, finance_period, slug=slug, name=dish_name, limit=limit
        )
    if act in ("margins", "dish_margins", "margin_rankings"):
        recipes = find_many(
            "recipes",
            restaurant_id,
            {"dishName": 1, "foodCost": 1, "sellPrice": 1, "progress": 1, "kind": 1},
            extra_filter={"progress": "ready", "kind": "dish"},
        )
        rows = []
        for recipe in recipes:
            sell = float(recipe.get("sellPrice", 0) or 0)
            cost = float(recipe.get("foodCost", 0) or 0)
            if sell <= 0 or cost <= 0:
                continue
            margin = sell - cost
            pct = margin / sell * 100
            rows.append((recipe.get("dishName", "dish"), margin, pct))
        if not rows:
            return "No priced recipes yet."
        reverse = view.lower() != "lowest"
        rows.sort(key=lambda row: row[1], reverse=reverse)
        return "\n".join(
            f"- {name}: ${margin:.2f} margin ({pct:.0f}%)" for name, margin, pct in rows[:10]
        )
    if act in ("sales_vs_purchases", "compare"):
        window = finance_period_range(period)
        sales_orders = find_many(
            "salesorders",
            restaurant_id,
            {"saleDate": 1, "uploadDate": 1, "items": 1, "status": 1},
            extra_filter={"status": "processed"},
        )
        purchase_orders = find_many(
            "purchaseorders",
            restaurant_id,
            {"purchaseDate": 1, "uploadDate": 1, "items": 1, "status": 1},
            extra_filter={"status": "processed"},
        )
        sales = sum(
            line_total(item)
            for order in sales_orders
            if order_in_period(order, window)
            for item in (order.get("items") or [])
        )
        purchases = sum(
            line_total(item)
            for order in purchase_orders
            if order_in_period(order, window)
            for item in (order.get("items") or [])
        )
        return (
            f"Period: {window.label}\n"
            f"POS sales: ${sales:.0f}\n"
            f"Supplier purchases: ${purchases:.0f}\n"
            "Note: purchases are bulk restocks, not per-ticket COGS."
        )
    if act in ("sales_queue", "sales_parse_queue"):
        return format_bill_queue(
            user_id,
            bill_type="customer",
            pending_only=True,
            bill_ids=bill_ids,
            limit=limit,
        )
    if act in ("sales_bill_summary", "bill_summary"):
        if not bill_id:
            return "Provide bill_id for sales_bill_summary."
        return get_bill_summary(restaurant_id, bill_id)
    if act == "purchase_prerequisite":
        purchase_orders = find_many(
            "purchaseorders",
            restaurant_id,
            {"status": 1},
            extra_filter={"status": "processed"},
            limit=1,
        )
        if purchase_orders:
            return "At least one supplier purchase bill has been processed — sales bills can be confirmed."
        return (
            "No processed supplier purchases yet. Process purchase bills in Inventory first "
            "so pantry baselines exist before confirming sales bills."
        )
    if act in ("suggest_price_change", "price_suggestion", "margin_pass"):
        return business_analytics.format_suggest_price_change(
            restaurant_id, slug=slug, name=dish_name
        )
    return (
        "Unknown action. Use: finance_summary, top_selling, slow_sellers, margins, "
        "sales_vs_purchases, sales_queue, sales_bill_summary, purchase_prerequisite, "
        "top_used_ingredients, promotion_opportunities, suggest_price_change, "
        "suggest_reorder_threshold."
    )


# --- Creative / menu reads ---


def read_menu(
    restaurant_id: str,
    action: str,
    *,
    cues_text: str = "",
    query: str = "",
    limit: int = 12,
) -> str:
    act = action.strip().lower().replace("-", "_")
    if act in ("cues", "todays_cues", "pantry_for_specials", "pantry"):
        return build_creative_context(restaurant_id, cues_text)
    if act in ("promotion_targets", "promotion_ideas", "slow_sellers_for_specials"):
        from tools.core import business_analytics

        return (
            "Promotion targets (from sales — draft a promotional recipe for these):\n"
            + business_analytics.format_promotion_opportunities(restaurant_id, "week")
        )
    if act in ("search_dishes", "search"):
        q = query.strip().lower()
        if not q:
            return "Provide a search query."
        dishes = find_many(
            "dishes",
            restaurant_id,
            {"name": 1, "slug": 1, "recipeStatus": 1, "sellPrice": 1},
        )
        matches = [d for d in dishes if q in str(d.get("name", "")).lower()][:limit]
        if not matches:
            return f"No dishes matching '{query}'."
        return "\n".join(
            f"- {d['name']} ({d.get('slug', '')}, {d.get('recipeStatus', 'new')})"
            for d in matches
        )
    if act in ("suggested", "suggested_dishes"):
        dishes = find_many("dishes", restaurant_id, {"name": 1, "slug": 1, "recipeStatus": 1})
        suggested = [d for d in dishes if d.get("recipeStatus") == "suggested"]
        if not suggested:
            return "No suggested dishes yet."
        return ", ".join(d["name"] for d in suggested)
    if act in ("active", "active_dishes"):
        dishes = find_many(
            "dishes",
            restaurant_id,
            {"name": 1, "slug": 1, "recipeStatus": 1, "sellPrice": 1},
        )
        active = [d for d in dishes if d.get("recipeStatus") in ("ready", "active", "published")]
        if not active:
            return "No active menu dishes found."
        return "\n".join(
            f"- {d['name']} (${float(d.get('sellPrice', 0) or 0):.2f})" for d in active[:limit]
        )
    if act in ("addons", "addon_catalog"):
        addons = find_many(
            "addons",
            restaurant_id,
            {"name": 1, "slug": 1, "classification": 1, "sellPrice": 1},
            limit=limit,
        )
        if not addons:
            return "No add-ons in catalog."
        return "\n".join(
            f"- {a['name']} ({a.get('classification', '')})" for a in addons
        )
    return (
        "Unknown action. Use: cues, search_dishes, suggested, active, addons, promotion_targets."
    )


# --- Sous Chef reads ---


def read_kitchen(restaurant_id: str, finance_period: str = "week") -> str:
    return build_head_context(restaurant_id, finance_period)
