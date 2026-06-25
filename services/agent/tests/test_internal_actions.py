"""Smoke tests for high-value internal actions on consolidated core tools."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from tools.core.factory import make_core_tools_for_agent
from tools.core.writes import CoreToolContext


RESTAURANT_ID = "507f1f77bcf86cd799439011"


class InternalActionsTest(unittest.TestCase):
    def _inventory_tools(self, ctx: CoreToolContext | None = None):
        ctx = ctx or CoreToolContext()
        tools = make_core_tools_for_agent("inventory", restaurant_id=RESTAURANT_ID, ctx=ctx)
        return ctx, {t.name: t for t in tools}

    def _head_tools(self, ctx: CoreToolContext | None = None):
        ctx = ctx or CoreToolContext()
        tools = make_core_tools_for_agent("head", restaurant_id=RESTAURANT_ID, ctx=ctx)
        return ctx, {t.name: t for t in tools}

    def _business_tools(self, ctx: CoreToolContext | None = None):
        ctx = ctx or CoreToolContext()
        tools = make_core_tools_for_agent("business", restaurant_id=RESTAURANT_ID, ctx=ctx)
        return ctx, {t.name: t for t in tools}

    def _menu_tools(self, ctx: CoreToolContext | None = None):
        ctx = ctx or CoreToolContext()
        tools = make_core_tools_for_agent("create", restaurant_id=RESTAURANT_ID, ctx=ctx)
        return ctx, {t.name: t for t in tools}

    def test_orchestrate_navigate_to(self):
        ctx, tools = self._head_tools()
        out = tools["orchestrate"].invoke({"action": "navigate_to", "page": "upload_purchase"})
        nav = ctx.latest_navigation()
        self.assertIsNotNone(nav)
        self.assertEqual(nav["path"], "/upload-orders?tab=purchase")
        self.assertIn("Upload purchase", out)

    def test_orchestrate_open_chat_agent(self):
        ctx, tools = self._head_tools()
        tools["orchestrate"].invoke(
            {"action": "open_chat_agent", "agent": "inventory", "reason": "stock check"}
        )
        nav = ctx.latest_navigation()
        self.assertEqual(nav["agent"], "inventory")
        self.assertEqual(nav["path"], "/dashboard")

    @patch("tools.core.factory.resolve_dish_slug")
    def test_apply_menu_generate_dish_image(self, mock_resolve):
        mock_resolve.return_value = {"slug": "latte", "name": "House Latte"}
        ctx, tools = self._menu_tools()
        out = tools["apply_menu"].invoke(
            {"action": "generate_dish_image", "slug": "latte", "image_mode": "pair"}
        )
        pending = ctx.latest_pending()
        self.assertEqual(pending["kind"], "generate_dish_image")
        self.assertEqual(pending["slug"], "latte")
        self.assertIn("House Latte", out)

    @patch("tools.core.factory.resolve_dish_slug")
    def test_apply_business_price_change_confirm_flow(self, mock_resolve):
        mock_resolve.return_value = {"slug": "latte", "name": "House Latte", "sellPrice": 4.5}

        ctx, tools = self._business_tools(CoreToolContext(confirm_business=False))
        preview = tools["apply_business"].invoke(
            {"action": "apply_price_change", "slug": "latte", "sell_price": 5.25}
        )
        self.assertIsNone(ctx.latest_pending())
        self.assertIn("confirm", preview.lower())

        ctx.confirm_business = True
        confirmed = tools["apply_business"].invoke(
            {"action": "apply_price_change", "slug": "latte", "sell_price": 5.25}
        )
        pending = ctx.latest_pending()
        self.assertEqual(pending["kind"], "update_dish_price")
        self.assertEqual(pending["sellPrice"], 5.25)
        self.assertIn("Confirmed", confirmed)

    @patch("tools.core.factory.check_create_ingredient")
    def test_apply_inventory_create_ingredient_confirm_flow(self, mock_lookup):
        mock_lookup.return_value = {"exact": None, "similar": []}

        ctx, tools = self._inventory_tools(CoreToolContext(confirm_inventory=False))
        preview = tools["apply_inventory"].invoke(
            {
                "action": "create_ingredient",
                "name": "Fresh Basil",
                "category": "produce",
                "current_qty": 2,
            }
        )
        self.assertIsNone(ctx.latest_pending())
        self.assertIn("confirm", preview.lower())

        ctx.confirm_inventory = True
        confirmed = tools["apply_inventory"].invoke(
            {
                "action": "create_ingredient",
                "name": "Fresh Basil",
                "category": "produce",
                "current_qty": 2,
            }
        )
        pending = ctx.latest_pending()
        self.assertEqual(pending["kind"], "create_ingredient")
        self.assertEqual(pending["ingredientName"], "Fresh Basil")
        self.assertIn("Confirmed", confirmed)

    @patch("tools.core.factory.resolve_ingredient_slugs")
    @patch("tools.core.factory.resolve_dish_slug")
    def test_apply_menu_link_ingredients_confirm_flow(self, mock_dish, mock_slugs):
        mock_dish.return_value = {"slug": "club-sandwich", "name": "Club Sandwich"}
        mock_slugs.return_value = (["ing-turkey", "ing-bacon"], [])

        ctx, tools = self._menu_tools(CoreToolContext(confirm_suggestion=False))
        preview = tools["apply_menu"].invoke(
            {
                "action": "link_dish_ingredients",
                "slug": "club-sandwich",
                "ingredient_slugs": ["turkey", "bacon"],
                "link_mode": "add",
            }
        )
        self.assertIsNone(ctx.latest_pending())
        self.assertIn("confirm", preview.lower())

        ctx.confirm_suggestion = True
        confirmed = tools["apply_menu"].invoke(
            {
                "action": "link_dish_ingredients",
                "slug": "club-sandwich",
                "ingredient_slugs": ["turkey", "bacon"],
                "link_mode": "add",
            }
        )
        pending = ctx.latest_pending()
        self.assertEqual(pending["kind"], "link_dish_ingredients")
        self.assertEqual(pending["linkMode"], "add")
        self.assertIn("ing-turkey", pending["ingredientSlugs"])
        self.assertIn("Confirmed", confirmed)

    @patch("tools.core.menu_actions.find_many")
    @patch("tools.core.menu_actions.find_one")
    def test_suggest_price_change_text(self, mock_find_one, mock_find_many):
        from tools.core.menu_actions import suggest_price_change_text

        mock_find_one.return_value = {"slug": "latte", "name": "House Latte", "sellPrice": 4.0}
        mock_find_many.return_value = [
            {"dishSlug": "latte", "foodCost": 2.0, "sellPrice": 4.0, "kind": "dish"}
        ]
        text = suggest_price_change_text(RESTAURANT_ID, slug="latte")
        self.assertIn("House Latte", text)
        self.assertIn("$4.00", text)


if __name__ == "__main__":
    unittest.main()
