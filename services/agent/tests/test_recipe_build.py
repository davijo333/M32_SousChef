"""Tests for recipe build planning and selections."""

from tools.core.recipe_build import (
    apply_recipe_selections,
    auto_default_selections,
    parse_selections_from_message,
    plan_recipe_build,
)


def test_plan_recipe_build_missing_ingredients_get_options(monkeypatch):
    def fake_options(_client, name):
        return [
            {
                "label": f"{name} pack",
                "brandName": "Kirkland",
                "store": "Costco",
                "imageUrl": "https://example.com/img.jpg",
                "score": 0.9,
            }
        ]

    monkeypatch.setattr(
        "tools.core.recipe_build._build_store_options",
        lambda _client, name: fake_options(_client, name),
    )
    monkeypatch.setattr("tools.core.recipe_build.resolve_ingredient_slug", lambda *_a, **_k: None)
    monkeypatch.setattr("tools.core.recipe_build.search_ingredients", lambda *_a, **_k: [])

    plan = plan_recipe_build(
        "rest-1",
        None,
        dish_name="Mango Smoothie",
        ingredients=[{"name": "mango", "qty": 1, "unit": "cup"}],
    )
    assert plan["dishName"] == "Mango Smoothie"
    assert plan["status"] == "selecting"
    assert len(plan["ingredients"]) == 1
    assert plan["ingredients"][0]["options"]


def test_apply_recipe_selections_and_auto_default():
    plan = {
        "dishName": "Mango Smoothie",
        "ingredients": [
            {
                "key": "mango",
                "name": "mango",
                "qtyPerServing": 1,
                "unit": "cup",
                "options": [
                    {"label": "Costco mango", "store": "Costco", "imageUrl": "https://a"},
                    {"label": "Kroger mango", "store": "Kroger", "imageUrl": "https://b"},
                ],
            }
        ],
        "status": "selecting",
    }
    updated = apply_recipe_selections(plan, {"mango": 2})
    row = updated["ingredients"][0]
    assert row["selectedOption"]["label"] == "Kroger mango"
    assert updated["status"] == "ready_to_finalize"

    auto = auto_default_selections(plan)
    assert auto["ingredients"][0]["selectedOption"]["label"] == "Costco mango"


def test_parse_selections_from_message():
    plan = {
        "ingredients": [{"key": "mango", "name": "mango", "options": [{}]}],
    }
    picks = parse_selections_from_message("I'll take mango: 1 for the smoothie", plan)
    assert picks == {"mango": 1}
