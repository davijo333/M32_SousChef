"""Catalog search query normalization and fuzzy dish lookup."""

from __future__ import annotations

from tools.core.catalog_lookup import normalize_catalog_search_query, search_dishes


def test_normalize_strips_question_phrasing():
    assert normalize_catalog_search_query("do we have mango dishes") == "mango"
    assert normalize_catalog_search_query("is there a mango dish in our system") == "mango"
    assert normalize_catalog_search_query("mango smoothie") == "mango smoothie"
    assert normalize_catalog_search_query("do we have dishes that are smoothies") == "smoothies"
    assert normalize_catalog_search_query("do we have dishes named smoothies") == "smoothies"


def test_search_dishes_matches_plural_and_any_name_word(monkeypatch):
    mango = {
        "name": "Mango Paradise Smoothie",
        "slug": "dish-mango-paradise-smoothie",
        "classification": "other",
        "sellPrice": 18.0,
    }
    oat = {
        "name": "Oat Milk Mocha",
        "slug": "dish-oat-milk-mocha",
        "classification": "coffee",
        "sellPrice": 12.0,
    }

    monkeypatch.setattr(
        "tools.core.catalog_lookup.find_many",
        lambda *args, **kwargs: [mango, oat],
    )

    assert search_dishes("r1", "smoothies")[0]["name"] == "Mango Paradise Smoothie"
    assert search_dishes("r1", "paradise")[0]["name"] == "Mango Paradise Smoothie"
    assert search_dishes("r1", "mocha")[0]["name"] == "Oat Milk Mocha"
    assert search_dishes("r1", "do we have dishes named smoothies")[0]["name"] == "Mango Paradise Smoothie"
