"""Tests for recipe draft parsing."""

from workflows.engine.recipe_draft import recipe_build_from_draft


def test_recipe_build_from_draft_parses_salad():
    draft = """### Avocado Spinach Salad

Description: A refreshing salad.

Ingredients:
- Hass Avocado: 1 each
- Organic Baby Spinach: 2 cups
- Roma Tomato: 1 each
- Olive Oil: 2 tablespoons

Preparation Steps:
1. Wash the spinach.
2. Slice the avocado.
3. Toss with dressing.

Visual Brief: A vibrant salad in a bowl.
"""
    plan = recipe_build_from_draft(draft, "Avocado Spinach Salad")
    assert plan is not None
    assert plan["dishName"] == "Avocado Spinach Salad"
    assert len(plan["ingredients"]) >= 4
    assert plan["instructions"] == [
        "Wash the spinach.",
        "Slice the avocado.",
        "Toss with dressing.",
    ]


def test_recipe_build_normalizes_prep_words_in_ingredient_names():
    draft = """### Mango Smoothie

Ingredients:
- Ripe mango — 1 each
- Yogurt — 0.5 cup
"""
    plan = recipe_build_from_draft(draft, "Mango Smoothie")
    assert plan is not None
    names = [row["name"] for row in plan["ingredients"]]
    assert "Mango" in names
    assert "Yogurt" in names
    assert "Ripe mango" not in names


def test_recipe_build_strips_full_kitchen_build_heading():
    draft = """### Full Kitchen Build for Mango Smoothie

Description: A refreshing blend.

Ingredients:
- Mango — 1 each
- Yogurt — 0.5 cup

Pantry Gaps:
- Mango — qty 0
- Yogurt — qty 0

Preparation Steps:
1. Blend and serve.
"""
    plan = recipe_build_from_draft(draft, "Mango Smoothie")
    assert plan is not None
    assert plan["dishName"] == "Mango Smoothie"
    assert len(plan["ingredients"]) == 2
    assert all("qty 0" not in row["name"].lower() for row in plan["ingredients"])
