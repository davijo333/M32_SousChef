"""Tests for update workflow catalog."""

from workflows.engine.loader import get_workflow


UPDATE_WORKFLOW_IDS = [
    "update_dish",
    "update_ingredient",
    "update_addon",
    "link_dish_ingredients",
    "link_addon_ingredients",
    "link_addons_to_dish",
]


def test_all_update_workflows_catalogued():
    for wf_id in UPDATE_WORKFLOW_IDS:
        wf = get_workflow(wf_id)
        assert wf is not None, wf_id
        assert wf.get("status") == "catalogued", wf_id


def test_update_dish_inventory_only():
    wf = get_workflow("update_dish")
    workers = wf.get("workers") or {}
    assert "inventory" in workers
    assert "create" not in workers


def test_update_dish_not_found_handoff():
    wf = get_workflow("update_dish")
    stop = next(s for s in wf["steps"] if s["id"] == "stop_not_found")
    assert stop.get("handoff_workflow") == "add_dish_from_chat"


def test_link_dish_ingredients_pantry_gaps():
    wf = get_workflow("link_dish_ingredients")
    step_ids = [s["id"] for s in wf.get("steps") or []]
    assert "check_recipe_ingredients" in step_ids
    assert "confirm_new_ingredients" in step_ids
    assert "add_new_ingredients" in step_ids
    assert step_ids.index("add_new_ingredients") < step_ids.index("persist")


def test_link_dish_optional_create_draft():
    wf = get_workflow("link_dish_ingredients")
    draft = next(s for s in wf["steps"] if s["id"] == "draft_recipe")
    assert draft.get("delegate") == ["create"]


def test_update_dish_allowed_fields_only():
    wf = get_workflow("update_dish")
    assert set(wf.get("allowed_fields") or []) == {
        "classification",
        "sell_price",
        "description",
    }
    step_ids = [s["id"] for s in wf.get("steps") or []]
    assert "route_post_persist" in step_ids
    assert step_ids.index("persist") < step_ids.index("route_post_persist")


def test_update_ingredient_allowed_fields():
    wf = get_workflow("update_ingredient")
    assert set(wf.get("allowed_fields") or []) == {
        "category",
        "current_qty",
        "reorder_threshold",
        "last_purchase_price",
        "last_ordered_qty",
    }


def test_update_addon_allowed_fields_only():
    wf = get_workflow("update_addon")
    assert set(wf.get("allowed_fields") or []) == {
        "classification",
        "sell_price",
        "description",
    }
    step_ids = [s["id"] for s in wf.get("steps") or []]
    assert "route_post_persist" in step_ids
    route = next(s for s in wf["steps"] if s["id"] == "route_post_persist")
    assert route.get("branch", {}).get("needs_ingredient_link") == "link_addon_ingredients"


def test_ingredient_update_not_found_handoff():
    wf = get_workflow("update_ingredient")
    stop = next(s for s in wf["steps"] if s["id"] == "stop_not_found")
    assert stop.get("handoff_workflow") == "add_ingredient_from_chat"
