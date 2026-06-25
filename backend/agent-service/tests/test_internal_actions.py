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

    def test_create_agent_read_only_tools(self):
        _, tools = self._menu_tools()
        self.assertIn("query_menu", tools)
        self.assertIn("query_inventory", tools)
        self.assertNotIn("apply_menu", tools)
        self.assertNotIn("apply_inventory", tools)

    @patch("tools.core.factory.resolve_dish_slug")
    def test_apply_menu_generate_dish_image(self, mock_resolve):
        mock_resolve.return_value = {"slug": "latte", "name": "House Latte"}
        ctx, tools = self._inventory_tools()
        out = tools["apply_menu"].invoke(
            {"action": "generate_dish_image", "slug": "latte", "image_mode": "pair"}
        )
        pending = ctx.latest_pending()
        self.assertEqual(pending["kind"], "generate_dish_image")
        self.assertEqual(pending["slug"], "latte")
        self.assertIn("House Latte", out)

    @patch("tools.core.factory.resolve_dish_slug")
    def test_apply_inventory_price_change_confirm_flow(self, mock_resolve):
        mock_resolve.return_value = {"slug": "latte", "name": "House Latte", "sellPrice": 4.5}

        ctx, tools = self._inventory_tools(CoreToolContext(confirm_inventory=False))
        preview = tools["apply_inventory"].invoke(
            {"action": "apply_price_change", "slug": "latte", "sell_price": 5.25}
        )
        self.assertIsNone(ctx.latest_pending())
        self.assertIn("confirm", preview.lower())

        ctx.confirm_inventory = True
        confirmed = tools["apply_inventory"].invoke(
            {"action": "apply_price_change", "slug": "latte", "sell_price": 5.25}
        )
        pending = ctx.latest_pending()
        self.assertEqual(pending["kind"], "update_dish_price")
        self.assertEqual(pending["sellPrice"], 5.25)
        self.assertIn("Confirmed", confirmed)

    def test_business_agent_read_only_tools(self):
        tools = make_core_tools_for_agent("business", restaurant_id=RESTAURANT_ID, ctx=CoreToolContext())
        names = {t.name for t in tools}
        self.assertIn("query_business", names)
        self.assertIn("query_inventory", names)
        self.assertNotIn("apply_business", names)

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

        ctx, tools = self._inventory_tools(CoreToolContext(confirm_inventory=False))
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

        ctx.confirm_inventory = True
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

    @patch("tools.core.business_analytics.find_many")
    def test_read_business_slow_sellers_action(self, mock_find_many):
        from tools.core.reads import read_business

        mock_find_many.side_effect = [
            [{"name": "Latte", "slug": "latte", "recipeStatus": "active"}],
            [
                {
                    "status": "processed",
                    "saleDate": "2026-06-20T12:00:00",
                    "items": [{"dishSlug": "latte", "qty": 2}],
                }
            ],
        ]
        text = read_business(RESTAURANT_ID, "slow_sellers", finance_period="week")
        self.assertIn("Slowest selling", text)
        self.assertIn("latte", text)

    @patch("tools.core.business_analytics.find_many")
    def test_read_business_promotion_opportunities(self, mock_find_many):
        from tools.core.reads import read_business

        mock_find_many.side_effect = [
            [
                {
                    "name": "Latte",
                    "slug": "latte",
                    "recipeStatus": "active",
                    "sellPrice": 4.0,
                }
            ],
            [],
            [{"kind": "dish", "dishSlug": "latte", "foodCost": 3.5, "sellPrice": 4.0}],
            [
                {
                    "status": "processed",
                    "saleDate": "2026-06-20T12:00:00",
                    "items": [{"dishSlug": "latte", "qty": 1}],
                }
            ],
        ]
        text = read_business(RESTAURANT_ID, "promotion_opportunities", finance_period="week")
        self.assertIn("Latte", text)
        self.assertIn("margin", text.lower())

    def test_business_spec_loader(self):
        from agents.shared import spec_loader

        self.assertTrue(spec_loader.has_agent_spec("business"))
        profile = spec_loader.load_profile("business")
        self.assertIsNotNone(profile)
        self.assertIn("analyst", profile["persona"].lower())
        instructions = spec_loader.load_specialist_instructions(
            "business", inventory="Inventory", creative="Creator", head="Sous Chef"
        )
        self.assertIn("suggest_price_change", instructions)
        tools = spec_loader.load_tool_instructions("business")
        self.assertIn("query_business", tools)

    def test_head_spec_loader(self):
        from agents.shared import spec_loader

        self.assertTrue(spec_loader.has_agent_spec("head"))
        profile = spec_loader.load_profile("head")
        self.assertIsNotNone(profile)
        self.assertIn("supervisor", profile["persona"].lower())
        instructions = spec_loader.load_specialist_instructions(
            "head", inventory="Inventory", business="Business", creative="Creator"
        )
        self.assertIn("suggested add-ons", instructions.lower())
        tools = spec_loader.load_tool_instructions("head")
        self.assertIn("orchestrate", tools)

    def test_creative_spec_loader(self):
        from agents.shared import spec_loader

        self.assertTrue(spec_loader.has_agent_spec("create"))
        profile = spec_loader.load_profile("create")
        self.assertIsNotNone(profile)
        self.assertIn("chef", profile["persona"].lower())
        instructions = spec_loader.load_specialist_instructions(
            "create", inventory="Inventory", business="Business", head="Sous Chef"
        )
        self.assertIn("expiring", instructions)
        self.assertIn("add-on", instructions.lower())
        tools = spec_loader.load_tool_instructions("create")
        self.assertIn("query_menu", tools)
        self.assertIn("promotion_targets", tools)

    @patch("tools.core.reads.business_analytics.format_promotion_opportunities")
    def test_read_menu_promotion_targets(self, mock_promo):
        from tools.core.reads import read_menu

        mock_promo.return_value = "- Slow Dish: promote"
        text = read_menu(RESTAURANT_ID, "promotion_targets", cues_text="")
        self.assertIn("Promotion targets", text)
        self.assertIn("Slow Dish", text)


if __name__ == "__main__":
    unittest.main()
