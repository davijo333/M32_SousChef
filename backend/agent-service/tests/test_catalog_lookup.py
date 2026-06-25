"""Catalog duplicate / similar lookup before writes."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from tools.core.catalog_lookup import (
    check_create_ingredient,
    format_create_collision,
    format_ingredient_summary,
)

RESTAURANT_ID = "507f1f77bcf86cd799439011"


class CatalogLookupTest(unittest.TestCase):
    @patch("tools.core.catalog_lookup.resolve_ingredient_slug")
    @patch("tools.core.catalog_lookup.search_ingredients")
    def test_create_collision_exact(self, mock_search, mock_resolve):
        mock_resolve.return_value = {
            "name": "Fresh Basil",
            "slug": "ing-fresh-basil",
            "currentQty": 2,
            "inventoryUnit": "bunch",
            "reorderThreshold": 1,
            "category": "produce",
            "label": "used",
        }
        mock_search.return_value = []
        lookup = check_create_ingredient(RESTAURANT_ID, "Fresh Basil")
        message = format_create_collision("ingredient", "Fresh Basil", lookup)
        self.assertIsNotNone(message)
        assert message is not None
        self.assertIn("already exists", message.lower())
        self.assertIn("ing-fresh-basil", message)

    @patch("tools.core.catalog_lookup.resolve_ingredient_slug")
    @patch("tools.core.catalog_lookup.search_ingredients")
    def test_create_collision_similar(self, mock_search, mock_resolve):
        mock_resolve.return_value = None
        mock_search.return_value = [
            {
                "name": "Basil",
                "slug": "ing-basil",
                "currentQty": 0,
                "inventoryUnit": "bunch",
                "reorderThreshold": 1,
                "category": "produce",
                "label": "new",
            }
        ]
        lookup = check_create_ingredient(RESTAURANT_ID, "Fresh Basil")
        message = format_create_collision("ingredient", "Fresh Basil", lookup)
        self.assertIsNotNone(message)
        assert message is not None
        self.assertIn("similar", message.lower())

    def test_format_ingredient_summary_includes_label(self):
        text = format_ingredient_summary(
            {
                "name": "Milk",
                "slug": "ing-milk",
                "currentQty": 0,
                "inventoryUnit": "gal",
                "reorderThreshold": 2,
                "category": "dairy",
                "label": "new",
            }
        )
        self.assertIn("label **new**", text)
        self.assertIn("0 gal", text)


if __name__ == "__main__":
    unittest.main()
