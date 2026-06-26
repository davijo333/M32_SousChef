"""Menu dish search — fuzzy lookup via catalog_lookup."""

from __future__ import annotations

from unittest.mock import patch

from tools.core.reads import read_menu

RESTAURANT_ID = "507f1f77bcf86cd799439011"

MANGO_DISH = {
    "name": "Mango Paradise Smoothie",
    "slug": "dish-mango-paradise-smoothie",
    "recipeStatus": "new",
    "sellPrice": 18.0,
}


@patch("tools.core.catalog_lookup.search_dishes")
def test_read_menu_search_dishes_normalizes_natural_question(mock_search):
    mock_search.return_value = [MANGO_DISH]

    result = read_menu(RESTAURANT_ID, "search_dishes", query="do we have mango dishes")

    mock_search.assert_called_once_with(RESTAURANT_ID, "mango", limit=12)
    assert "Mango Paradise Smoothie" in result


@patch("tools.core.catalog_lookup.search_dishes")
def test_read_menu_search_dishes_no_match(mock_search):
    mock_search.return_value = []

    result = read_menu(RESTAURANT_ID, "search_dishes", query="unicorn tart")

    assert result == "No dishes matching 'unicorn tart'."
