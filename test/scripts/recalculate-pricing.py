#!/usr/bin/env python3
"""Derive ingredient and menu prices from wholesale PO costs + recipe portions.

Dish/add-on sell price = sum(ingredient cost per serving) × (1 + MARGIN).
Updates test/inventory/*.json and syncs sales-orders unit prices.

Run from repo root: python3 test/scripts/recalculate-pricing.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

TEST_ROOT = Path(__file__).resolve().parent.parent
INVENTORY = TEST_ROOT / "inventory"

# Menu price = food cost × (1 + MARGIN). 3.0 → 4× food cost (~25% food cost %).
MARGIN = 3.0

# Minimum menu prices by dish classification.
PRICE_FLOORS: dict[str, float] = {
    "sandwich": 4.49,
    "byo-sandwich": 3.49,
    "coffee": 2.99,
    "tea": 2.49,
    "juice": 3.49,
}
ADDON_PRICE_FLOOR = 0.99

# Kitchen-unit → count per inventory unit (see test/inventory usage in dish/add-on JSON)
USAGE_UNITS: dict[str, dict[str, float]] = {
    "ing-croissant": {"each": 1},
    "ing-sourdough-bread": {"slice": 16, "loaf": 1},
    "ing-bagel": {"each": 12, "dozen": 1},
    "ing-multigrain-bagel": {"each": 12, "dozen": 1},
    "ing-bacon": {"slice": 16, "lb": 1},
    "ing-sausage": {"link": 8, "lb": 1},
    "ing-egg": {"each": 12, "dozen": 1},
    "ing-cheddar": {"oz": 16, "slice": 24, "lb": 1},
    "ing-swiss": {"oz": 16, "slice": 24, "lb": 1},
    "ing-american": {"oz": 16, "slice": 24, "lb": 1},
    "ing-butter": {"oz": 16, "lb": 1},
    "ing-spinach": {"cup": 4, "lb": 1},
    "ing-tomato": {"slice": 8, "lb": 1},
    "ing-bell-pepper": {"cup": 4, "lb": 1},
    "ing-avocado": {"each": 48, "case": 1},
    "ing-coffee-beans": {"oz": 16, "lb": 1},
    "ing-espresso": {"oz": 16, "lb": 1},
    "ing-whole-milk": {"oz": 128, "gallon": 1},
    "ing-skim-milk": {"oz": 128, "gallon": 1},
    "ing-oat-milk": {"oz": 64, "each": 1},
    "ing-almond-milk": {"oz": 64, "each": 1},
    "ing-soy-milk": {"oz": 64, "each": 1},
    "ing-half-and-half": {"oz": 32, "quart": 1},
    "ing-mocha-syrup": {"oz": 25.4, "each": 1},
    "ing-vanilla-syrup": {"oz": 25.4, "each": 1},
    "ing-caramel-syrup": {"oz": 25.4, "each": 1},
    "ing-hazelnut-syrup": {"oz": 25.4, "each": 1},
    "ing-ice": {"oz": 16, "lb": 1},
    "ing-heavy-cream": {"oz": 64, "half-gallon": 1},
    "ing-frothing-milk": {"oz": 128, "gallon": 1},
    "ing-black-tea": {"bag": 100, "box": 1},
    "ing-green-tea": {"bag": 100, "box": 1},
    "ing-orange-juice": {"oz": 128, "gallon": 1},
    "ing-apple-juice": {"oz": 128, "gallon": 1},
    "ing-cranberry-juice": {"oz": 96, "each": 1},
}


def po_price_per_inventory_unit(slug: str, description: str, unit_price: float) -> float:
    """Convert a PO line unit price to price per ingredient inventory unit."""
    d = description.lower()
    if slug == "ing-croissant":
        return unit_price / 48
    if slug == "ing-egg":
        return unit_price / 15
    if slug == "ing-coffee-beans":
        return unit_price / 5
    if slug == "ing-orange-juice":
        return unit_price / (2 if "2pk" in d else 1)
    if slug == "ing-bacon":
        return unit_price / (15 if "15lb" in d else 10)
    if slug == "ing-sausage":
        return unit_price / 5
    if slug == "ing-cheddar":
        return unit_price / (2.5 if "2.5lb" in d else 5)
    if slug == "ing-spinach":
        return unit_price / 2
    if slug == "ing-tomato":
        return unit_price / 5
    if slug == "ing-bagel" or slug == "ing-multigrain-bagel":
        return unit_price / 3
    if slug == "ing-swiss":
        return unit_price / 2
    if slug == "ing-american":
        return unit_price / 3
    if slug == "ing-butter":
        return unit_price / (4 if "4pk" in d else 1)
    if slug == "ing-bell-pepper":
        return unit_price / 3
    if slug == "ing-espresso":
        return unit_price / 2.2
    if slug == "ing-ice":
        return unit_price / 20
    # 1:1 purchase unit ↔ inventory unit
    return unit_price


def usage_cost(slug: str, qty: float, unit: str, inventory_prices: dict[str, float]) -> float:
    price = inventory_prices.get(slug)
    if price is None:
        raise KeyError(f"No inventory price for {slug}")
    factors = USAGE_UNITS.get(slug, {})
    factor = factors.get(unit)
    if factor is None:
        if unit in factors.values() or unit == "each" and slug in factors:
            factor = factors.get("each", 1)
        else:
            raise KeyError(f"No usage conversion for {slug} unit={unit}")
    inventory_qty = qty / factor
    return inventory_qty * price


def normalize_classification(value: str | None) -> str | None:
    if not value:
        return value
    c = value.strip().lower().replace("_", "-")
    if c in ("byo-sandwich", "byo sandwich"):
        return "byo-sandwich"
    return c


def sell_from_cost(cost: float, classification: str | None = None, *, is_addon: bool = False) -> float:
    price = round(cost * (1 + MARGIN) + 1e-9, 2)
    if is_addon:
        return max(price, ADDON_PRICE_FLOOR)
    if classification:
        return max(price, PRICE_FLOORS.get(classification, 0))
    return price

# Recipe portions per dish slug (kitchen units)
DISH_RECIPES: dict[str, list[dict]] = {
    "dish-sunrise-stack": [
        {"ingredientSlug": "ing-croissant", "qtyPerServing": 1, "unit": "each"},
        {"ingredientSlug": "ing-bacon", "qtyPerServing": 3, "unit": "slice"},
        {"ingredientSlug": "ing-egg", "qtyPerServing": 1, "unit": "each"},
        {"ingredientSlug": "ing-cheddar", "qtyPerServing": 1.5, "unit": "oz"},
        {"ingredientSlug": "ing-butter", "qtyPerServing": 0.25, "unit": "oz"},
    ],
    "dish-garden-morning-croissant": [
        {"ingredientSlug": "ing-croissant", "qtyPerServing": 1, "unit": "each"},
        {"ingredientSlug": "ing-egg", "qtyPerServing": 2, "unit": "each"},
        {"ingredientSlug": "ing-swiss", "qtyPerServing": 1, "unit": "oz"},
        {"ingredientSlug": "ing-spinach", "qtyPerServing": 0.25, "unit": "cup"},
        {"ingredientSlug": "ing-tomato", "qtyPerServing": 2, "unit": "slice"},
        {"ingredientSlug": "ing-avocado", "qtyPerServing": 0.5, "unit": "each"},
    ],
    "dish-farmers-double": [
        {"ingredientSlug": "ing-sourdough-bread", "qtyPerServing": 2, "unit": "slice"},
        {"ingredientSlug": "ing-butter", "qtyPerServing": 0.25, "unit": "oz"},
        {"ingredientSlug": "ing-bacon", "qtyPerServing": 2, "unit": "slice"},
        {"ingredientSlug": "ing-sausage", "qtyPerServing": 2, "unit": "link"},
        {"ingredientSlug": "ing-egg", "qtyPerServing": 1, "unit": "each"},
        {"ingredientSlug": "ing-american", "qtyPerServing": 1.5, "unit": "oz"},
    ],
    "dish-build-your-own-croissant": [
        {"ingredientSlug": "ing-croissant", "qtyPerServing": 1, "unit": "each"},
        {"ingredientSlug": "ing-bacon", "qtyPerServing": 2, "unit": "slice"},
        {"ingredientSlug": "ing-egg", "qtyPerServing": 1, "unit": "each"},
        {"ingredientSlug": "ing-swiss", "qtyPerServing": 1, "unit": "oz"},
    ],
    "dish-build-your-own-sourdough": [
        {"ingredientSlug": "ing-sourdough-bread", "qtyPerServing": 2, "unit": "slice"},
        {"ingredientSlug": "ing-butter", "qtyPerServing": 0.25, "unit": "oz"},
        {"ingredientSlug": "ing-sausage", "qtyPerServing": 2, "unit": "link"},
        {"ingredientSlug": "ing-egg", "qtyPerServing": 1, "unit": "each"},
    ],
    "dish-build-your-own-bagel": [
        {"ingredientSlug": "ing-bagel", "qtyPerServing": 1, "unit": "each"},
        {"ingredientSlug": "ing-butter", "qtyPerServing": 0.25, "unit": "oz"},
        {"ingredientSlug": "ing-bacon", "qtyPerServing": 2, "unit": "slice"},
        {"ingredientSlug": "ing-spinach", "qtyPerServing": 0.25, "unit": "cup"},
        {"ingredientSlug": "ing-tomato", "qtyPerServing": 2, "unit": "slice"},
    ],
    "dish-hot-coffee": [
        {"ingredientSlug": "ing-coffee-beans", "qtyPerServing": 0.05, "unit": "lb"},
        {"ingredientSlug": "ing-whole-milk", "qtyPerServing": 8, "unit": "oz"},
    ],
    "dish-lavazza-house-coffee": [
        {"ingredientSlug": "ing-espresso", "qtyPerServing": 2, "unit": "oz"},
    ],
    "dish-oat-vanilla-coffee": [
        {"ingredientSlug": "ing-coffee-beans", "qtyPerServing": 0.05, "unit": "lb"},
        {"ingredientSlug": "ing-oat-milk", "qtyPerServing": 12, "unit": "oz"},
        {"ingredientSlug": "ing-vanilla-syrup", "qtyPerServing": 0.5, "unit": "oz"},
    ],
    "dish-skim-frappe": [
        {"ingredientSlug": "ing-espresso", "qtyPerServing": 2, "unit": "oz"},
        {"ingredientSlug": "ing-skim-milk", "qtyPerServing": 8, "unit": "oz"},
        {"ingredientSlug": "ing-ice", "qtyPerServing": 6, "unit": "oz"},
        {"ingredientSlug": "ing-heavy-cream", "qtyPerServing": 2, "unit": "oz"},
    ],
    "dish-caramel-almond-frappe": [
        {"ingredientSlug": "ing-espresso", "qtyPerServing": 2, "unit": "oz"},
        {"ingredientSlug": "ing-almond-milk", "qtyPerServing": 10, "unit": "oz"},
        {"ingredientSlug": "ing-caramel-syrup", "qtyPerServing": 1, "unit": "oz"},
        {"ingredientSlug": "ing-ice", "qtyPerServing": 8, "unit": "oz"},
        {"ingredientSlug": "ing-heavy-cream", "qtyPerServing": 2, "unit": "oz"},
    ],
    "dish-hazelnut-mocha": [
        {"ingredientSlug": "ing-espresso", "qtyPerServing": 2, "unit": "oz"},
        {"ingredientSlug": "ing-mocha-syrup", "qtyPerServing": 1, "unit": "oz"},
        {"ingredientSlug": "ing-whole-milk", "qtyPerServing": 10, "unit": "oz"},
        {"ingredientSlug": "ing-hazelnut-syrup", "qtyPerServing": 0.5, "unit": "oz"},
    ],
    "dish-vanilla-cappuccino": [
        {"ingredientSlug": "ing-espresso", "qtyPerServing": 2, "unit": "oz"},
        {"ingredientSlug": "ing-half-and-half", "qtyPerServing": 4, "unit": "oz"},
        {"ingredientSlug": "ing-vanilla-syrup", "qtyPerServing": 0.5, "unit": "oz"},
        {"ingredientSlug": "ing-frothing-milk", "qtyPerServing": 2, "unit": "oz"},
    ],
    "dish-oat-mocha": [
        {"ingredientSlug": "ing-espresso", "qtyPerServing": 2, "unit": "oz"},
        {"ingredientSlug": "ing-oat-milk", "qtyPerServing": 10, "unit": "oz"},
        {"ingredientSlug": "ing-mocha-syrup", "qtyPerServing": 1, "unit": "oz"},
    ],
    "dish-english-breakfast-tea": [
        {"ingredientSlug": "ing-black-tea", "qtyPerServing": 1, "unit": "bag"},
    ],
    "dish-green-tea": [
        {"ingredientSlug": "ing-green-tea", "qtyPerServing": 1, "unit": "bag"},
    ],
    "dish-orange-juice": [
        {"ingredientSlug": "ing-orange-juice", "qtyPerServing": 16, "unit": "oz"},
    ],
    "dish-apple-juice": [
        {"ingredientSlug": "ing-apple-juice", "qtyPerServing": 16, "unit": "oz"},
    ],
    "dish-cranberry-juice": [
        {"ingredientSlug": "ing-cranberry-juice", "qtyPerServing": 20, "unit": "oz"},
    ],
    "dish-soy-coffee": [
        {"ingredientSlug": "ing-coffee-beans", "qtyPerServing": 0.05, "unit": "lb"},
        {"ingredientSlug": "ing-soy-milk", "qtyPerServing": 8, "unit": "oz"},
    ],
    "dish-veggie-croissant": [
        {"ingredientSlug": "ing-croissant", "qtyPerServing": 1, "unit": "each"},
        {"ingredientSlug": "ing-spinach", "qtyPerServing": 0.25, "unit": "cup"},
        {"ingredientSlug": "ing-tomato", "qtyPerServing": 2, "unit": "slice"},
        {"ingredientSlug": "ing-bell-pepper", "qtyPerServing": 0.125, "unit": "cup"},
    ],
    "dish-sourdough-melt": [
        {"ingredientSlug": "ing-sourdough-bread", "qtyPerServing": 2, "unit": "slice"},
        {"ingredientSlug": "ing-butter", "qtyPerServing": 0.25, "unit": "oz"},
        {"ingredientSlug": "ing-bacon", "qtyPerServing": 3, "unit": "slice"},
        {"ingredientSlug": "ing-cheddar", "qtyPerServing": 1.5, "unit": "oz"},
    ],
    "dish-loaded-bagel": [
        {"ingredientSlug": "ing-bagel", "qtyPerServing": 1, "unit": "each"},
        {"ingredientSlug": "ing-butter", "qtyPerServing": 0.25, "unit": "oz"},
        {"ingredientSlug": "ing-sausage", "qtyPerServing": 2, "unit": "link"},
        {"ingredientSlug": "ing-egg", "qtyPerServing": 1, "unit": "each"},
        {"ingredientSlug": "ing-american", "qtyPerServing": 1.5, "unit": "oz"},
    ],
    "dish-classic-bagel": [
        {"ingredientSlug": "ing-bagel", "qtyPerServing": 1, "unit": "each"},
        {"ingredientSlug": "ing-butter", "qtyPerServing": 0.25, "unit": "oz"},
    ],
    "dish-multigrain-bagel": [
        {"ingredientSlug": "ing-multigrain-bagel", "qtyPerServing": 1, "unit": "each"},
        {"ingredientSlug": "ing-butter", "qtyPerServing": 0.25, "unit": "oz"},
    ],
}

ADDON_RECIPES: dict[str, list[dict]] = {
    "addon-bacon": [{"ingredientSlug": "ing-bacon", "qtyPerServing": 2, "unit": "slice"}],
    "addon-sausage": [{"ingredientSlug": "ing-sausage", "qtyPerServing": 2, "unit": "link"}],
    "addon-egg": [{"ingredientSlug": "ing-egg", "qtyPerServing": 1, "unit": "each"}],
    "addon-cheese": [{"ingredientSlug": "ing-cheddar", "qtyPerServing": 1, "unit": "oz"}],
    "addon-american-cheese": [{"ingredientSlug": "ing-american", "qtyPerServing": 1, "unit": "oz"}],
    "addon-swiss": [{"ingredientSlug": "ing-swiss", "qtyPerServing": 1, "unit": "oz"}],
    "addon-veggies": [
        {"ingredientSlug": "ing-spinach", "qtyPerServing": 0.25, "unit": "cup"},
        {"ingredientSlug": "ing-tomato", "qtyPerServing": 2, "unit": "slice"},
        {"ingredientSlug": "ing-bell-pepper", "qtyPerServing": 0.125, "unit": "cup"},
    ],
    "addon-whipped-cream": [{"ingredientSlug": "ing-heavy-cream", "qtyPerServing": 1.5, "unit": "oz"}],
    "addon-extra-shot": [{"ingredientSlug": "ing-espresso", "qtyPerServing": 1, "unit": "oz"}],
}


def load_json(path: Path) -> dict:
    return json.loads(path.read_text())


def save_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2) + "\n")


def build_inventory_prices(po_doc: dict) -> dict[str, float]:
    """Latest PO price per ingredient slug (highest seedDay wins)."""
    latest: dict[str, tuple[int, float]] = {}
    for order in po_doc["purchaseOrders"]:
        seed_day = int(order.get("seedDay", 0))
        for line in order["lines"]:
            for slug in line.get("ingredientSlugs", []):
                price = po_price_per_inventory_unit(
                    slug, line["description"], float(line["unitPrice"])
                )
                prev = latest.get(slug)
                if prev is None or seed_day >= prev[0]:
                    latest[slug] = (seed_day, price)
    return {slug: price for slug, (_, price) in latest.items()}


def recipe_cost(links: list[dict], inventory_prices: dict[str, float]) -> float:
    total = 0.0
    for link in links:
        total += usage_cost(
            link["ingredientSlug"],
            float(link["qtyPerServing"]),
            link["unit"],
            inventory_prices,
        )
    return total


def main() -> None:
    po_doc = load_json(INVENTORY / "purchase-orders.json")
    ingredients_doc = load_json(INVENTORY / "ingredients.json")
    dishes_doc = load_json(INVENTORY / "dishes.json")
    addons_doc = load_json(INVENTORY / "add-ons.json")
    sales_doc = load_json(INVENTORY / "sales-orders.json")

    inventory_prices = build_inventory_prices(po_doc)

    for ing in ingredients_doc["ingredients"]:
        slug = ing["slug"]
        if slug in inventory_prices:
            ing["lastPurchasePrice"] = round(inventory_prices[slug] + 1e-9, 2)

    dish_prices: dict[str, float] = {}
    for dish in dishes_doc["dishes"]:
        slug = dish["slug"]
        links = DISH_RECIPES.get(slug)
        if not links:
            raise KeyError(f"Missing recipe for {slug}")
        dish["ingredientLinks"] = links
        dish["ingredientSlugs"] = [link["ingredientSlug"] for link in links]
        normalized = normalize_classification(dish.get("classification"))
        if normalized:
            dish["classification"] = normalized
        cost = recipe_cost(links, inventory_prices)
        dish["foodCost"] = round(cost + 1e-9, 2)
        dish["sellPrice"] = sell_from_cost(
            cost, normalize_classification(dish.get("classification"))
        )
        dish_prices[slug] = dish["sellPrice"]
        print(f"  {slug}: cost ${cost:.2f} → sell ${dish['sellPrice']:.2f}")

    addon_prices: dict[str, float] = {}
    for addon in addons_doc["addOns"]:
        slug = addon["slug"]
        links = ADDON_RECIPES[slug]
        addon["ingredientLinks"] = links
        addon["ingredientSlugs"] = [link["ingredientSlug"] for link in links]
        cost = recipe_cost(links, inventory_prices)
        addon["foodCost"] = round(cost + 1e-9, 2)
        addon["sellPrice"] = sell_from_cost(cost, is_addon=True)
        addon_prices[slug] = addon["sellPrice"]
        print(f"  {slug}: cost ${cost:.2f} → sell ${addon['sellPrice']:.2f}")

    for order in sales_doc["salesOrders"]:
        for line in order["lines"]:
            if "dishSlug" in line:
                line["unitPrice"] = dish_prices[line["dishSlug"]]
            elif "addOnSlug" in line:
                line["unitPrice"] = addon_prices[line["addOnSlug"]]

    save_json(INVENTORY / "ingredients.json", ingredients_doc)
    save_json(INVENTORY / "dishes.json", dishes_doc)
    save_json(INVENTORY / "add-ons.json", addons_doc)
    save_json(INVENTORY / "sales-orders.json", sales_doc)

    print(f"\nUpdated pricing for {len(dish_prices)} dishes and {len(addon_prices)} add-ons.")
    print(f"Ingredient prices from {len(inventory_prices)} wholesale PO lines.")


if __name__ == "__main__":
    main()
