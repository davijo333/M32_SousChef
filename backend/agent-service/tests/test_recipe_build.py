"""Tests for recipe build planning and selections."""

from tools.core.recipe_build import (
    apply_recipe_selections,
    auto_default_selections,
    basic_pantry_name,
    extract_dish_name_from_history,
    extract_recipe_draft_from_history,
    infer_qty_unit,
    ingredient_search_query,
    plan_recipe_build,
    thread_has_recipe_draft,
)


def test_basic_pantry_name_strips_prep_words():
    assert basic_pantry_name("Ripe Mango") == "Mango"
    assert basic_pantry_name("Fresh Orange Juice") == "Orange Juice"
    assert basic_pantry_name("Ice Cubes") == "Ice"
    assert ingredient_search_query("Ice") == "bagged ice cubes grocery"


def test_plan_recipe_build_uses_general_names_no_store_options(monkeypatch):
    monkeypatch.setattr("tools.core.recipe_build.resolve_ingredient_slug", lambda *_a, **_k: None)
    monkeypatch.setattr("tools.core.recipe_build.search_ingredients", lambda *_a, **_k: [])

    plan = plan_recipe_build(
        "rest-1",
        None,
        dish_name="Mango Smoothie",
        visual_brief="Overhead shot, bright natural light, tall glass with mango garnish.",
        ingredients=[{"name": "Ripe Mango", "qty": 1, "unit": "cup"}],
    )
    assert plan["dishName"] == "Mango Smoothie"
    assert plan["status"] == "ready_to_finalize"
    assert plan["visualBrief"].startswith("Overhead")
    assert len(plan["ingredients"]) == 1
    assert plan["ingredients"][0]["name"] == "Mango"
    assert "options" not in plan["ingredients"][0]


def test_apply_recipe_selections_is_noop():
    plan = {
        "dishName": "Mango Smoothie",
        "ingredients": [{"key": "mango", "name": "Mango", "qtyPerServing": 1, "unit": "cup"}],
        "status": "ready_to_finalize",
    }
    updated = apply_recipe_selections(plan, {"mango": 2})
    assert updated["status"] == "ready_to_finalize"
    assert updated["ingredients"][0]["name"] == "Mango"

    auto = auto_default_selections(plan)
    assert auto["status"] == "ready_to_finalize"


def test_infer_qty_unit_for_smoothie_ingredients():
    assert infer_qty_unit("Mango Puree", "juice") == (0.5, "cup")
    assert infer_qty_unit("Orange Juice", "juice") == (4.0, "oz")
    assert infer_qty_unit("Ice", "beverage") == (1.0, "cup")
    assert infer_qty_unit("Whipped cream", "juice") == (2.0, "tbsp")


def test_extract_dish_name_ignores_creator_agent_header():
    history = [
        {"role": "user", "content": "lets add a dish mango smoothie"},
        {
            "role": "assistant",
            "content": (
                "I consulted the **Creator Agent** and used their tools for this step.\n\n"
                "**Creator Agent**\n"
                "### Mango Smoothie\n\n"
                "Description: A refreshing blend.\n\n"
                "Ingredients:\n"
                "- Ripe Mango — 3 each\n"
                "- Yogurt — 1 cup\n\n"
                "Prep Steps:\n"
                "1. Peel mangoes.\n"
                "2. Blend.\n\n"
                "Please confirm the kitchen build for the Mango Smoothie."
            ),
        },
    ]
    assert extract_dish_name_from_history(history) == "Mango Smoothie"


def test_is_agent_assistant_label():
    from tools.core.catalog_draft_helpers import is_agent_assistant_label, is_valid_recipe_dish_name

    assert is_agent_assistant_label("Creator Agent") is True
    assert is_valid_recipe_dish_name("Creator Agent") is False
    assert is_valid_recipe_dish_name("Mango Smoothie") is True


def test_thread_has_recipe_draft_from_creative_format():
    history = [
        {
            "role": "assistant",
            "content": (
                "### Menu Name: Creamy Banana Smoothie\n"
                "Ingredients:\n- Banana — 2 each\n- Milk — 1 cup\n"
                "Prep Steps:\n1. Peel bananas.\n2. Blend.\n"
            ),
        }
    ]
    assert thread_has_recipe_draft(history) is True


def test_extract_recipe_draft_from_history():
    history = [
        {
            "role": "assistant",
            "content": (
                "Here's a draft of the ingredients for the Mango Smoothie:\n"
                "- Mango (fresh or frozen)\n"
                "- Yogurt (plain or flavored)\n"
                "- Lime juice\n"
                "- Ice\n"
                "- Whipped cream (for topping)\n\n"
                "Visual brief: Overhead shot in a tall glass, bright cafe lighting, mango slice garnish.\n\n"
                "Recipe:\n"
                "1. In a blender, combine mango, yogurt, lime juice, and ice.\n"
                "2. Blend until smooth and creamy.\n"
                "3. Pour into a glass and top with whipped cream.\n"
                "4. Serve chilled."
            ),
        }
    ]
    draft = extract_recipe_draft_from_history(history)
    names = [row["name"] for row in draft["ingredients"]]
    assert "Mango" in names
    assert "Yogurt" in names
    assert len(draft["instructions"]) == 4
    assert "Overhead" in draft["visualBrief"]


def test_plan_recipe_build_infers_qty_unit(monkeypatch):
    monkeypatch.setattr("tools.core.recipe_build.resolve_ingredient_slug", lambda *_a, **_k: None)
    monkeypatch.setattr("tools.core.recipe_build.search_ingredients", lambda *_a, **_k: [])

    plan = plan_recipe_build(
        "rest-1",
        None,
        dish_name="Mango Smoothie",
        classification="juice",
        ingredients=[
            {"name": "Mango"},
            {"name": "Orange Juice"},
            {"name": "Ice"},
        ],
    )
    rows = {row["name"]: row for row in plan["ingredients"]}
    assert rows["Mango"]["qtyPerServing"] == 0.5
    assert rows["Mango"]["unit"] == "cup"
    assert rows["Orange Juice"]["qtyPerServing"] == 4.0
    assert rows["Ice"]["qtyPerServing"] == 1.0
