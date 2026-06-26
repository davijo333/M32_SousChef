"""Tests for workflow catalog loader."""

from workflows.engine.loader import get_workflow, load_catalog

ADD_DISH_CORE_STEPS = [
    "intake",
    "route_intake",
    "duplicate_check",
    "stop_warn_chef",
    "confirm_dish_identity",
    "draft_recipe",
    "confirm_recipe",
    "check_recipe_ingredients",
    "confirm_new_ingredients",
    "add_new_ingredients",
    "confirm_finalize",
    "persist_build",
    "persist_new_addons",
    "link_addons_to_dish",
    "completed",
]

ADD_DISH_INTAKE_STEPS = [
    "image_context",
    "confirm_name_from_image",
    "gather_preferences",
    "suggest_dish_ideas",
    "pick_dish",
]


def test_load_catalog_has_add_dish():
    catalog = load_catalog()
    assert "workflows" in catalog
    wf = get_workflow("add_dish_from_chat")
    assert wf is not None
    assert wf["id"] == "add_dish_from_chat"
    assert wf.get("status") == "catalogued"


def test_add_dish_intake_modes_defined():
    wf = get_workflow("add_dish_from_chat")
    modes = wf.get("intake_modes") or {}
    assert set(modes.keys()) == {
        "name_only",
        "image_only",
        "name_and_image",
        "ideas_request",
        "neither",
    }


def test_add_dish_steps_from_catalog():
    wf = get_workflow("add_dish_from_chat")
    step_ids = [s["id"] for s in wf.get("steps") or []]
    for expected in ADD_DISH_CORE_STEPS + ADD_DISH_INTAKE_STEPS:
        assert expected in step_ids, f"missing step {expected}"


def test_suggest_dish_ideas_name_description_why():
    wf = get_workflow("add_dish_from_chat")
    step = next(s for s in wf["steps"] if s["id"] == "suggest_dish_ideas")
    template = step.get("task_template") or ""
    assert "description" in template.lower()
    assert "why" in template.lower()
    assert "no recipes" in template.lower() or "no recipe" in template.lower()
    assert step["delegate"] == ["create"]


def test_ideas_request_skips_gather_preferences():
    wf = get_workflow("add_dish_from_chat")
    route = next(s for s in wf["steps"] if s["id"] == "route_intake")
    assert route["branch"]["ideas_request"] == "suggest_dish_ideas"
    assert route["branch"]["neither"] == "gather_preferences"


def test_name_only_route_skips_gather():
    wf = get_workflow("add_dish_from_chat")
    route = next(s for s in wf["steps"] if s["id"] == "route_intake")
    assert route["branch"]["name_only"] == "duplicate_check"


def test_add_dish_persist_is_batched():
    wf = get_workflow("add_dish_from_chat")
    step = next(s for s in wf["steps"] if s["id"] == "persist_build")
    assert step.get("implementation") == "batched"


def test_split_catalog_files_load_addition_workflows():
    assert get_workflow("add_dish_from_chat") is not None
    assert get_workflow("add_ingredient_from_chat") is not None
    assert get_workflow("add_ingredient_from_chat").get("status") == "catalogued"
    assert get_workflow("add_addon_from_chat") is not None
    assert get_workflow("add_addon_from_chat").get("status") == "catalogued"


def test_no_lite_suggested_workflow():
    assert get_workflow("add_suggested_dish_lite") is None
    assert get_workflow("build_suggested_dish_from_chat") is None


def test_addon_pantry_before_link_steps():
    wf = get_workflow("add_addon_from_chat")
    step_ids = [s["id"] for s in wf.get("steps") or []]
    assert step_ids.index("check_addon_ingredients") < step_ids.index("confirm_new_ingredients")
    assert step_ids.index("confirm_new_ingredients") < step_ids.index("add_new_ingredients")
    assert step_ids.index("add_new_ingredients") < step_ids.index("link_ingredients")


def test_dish_duplicate_stop_warn_handoff():
    wf = get_workflow("add_dish_from_chat")
    dup = next(s for s in wf["steps"] if s["id"] == "duplicate_check")
    assert dup.get("on_duplicate") == "stop_warn_chef"
    stop = next(s for s in wf["steps"] if s["id"] == "stop_warn_chef")
    assert stop.get("handoff_workflow") == "update_dish"
    assert stop.get("clears_workflow_state") is True


def test_dish_addon_link_after_persist():
    wf = get_workflow("add_dish_from_chat")
    step_ids = [s["id"] for s in wf.get("steps") or []]
    assert step_ids.index("persist_build") < step_ids.index("persist_new_addons")
    assert step_ids.index("persist_new_addons") < step_ids.index("link_addons_to_dish")
    link = next(s for s in wf["steps"] if s["id"] == "link_addons_to_dish")
    assert "linked_dish_slugs" in (link.get("task_template") or "")


def test_dish_two_confirm_gates_after_recipe():
    wf = get_workflow("add_dish_from_chat")
    step_ids = [s["id"] for s in wf.get("steps") or []]
    assert step_ids.index("confirm_recipe") < step_ids.index("check_recipe_ingredients")
    assert step_ids.index("check_recipe_ingredients") < step_ids.index("confirm_new_ingredients")
    assert step_ids.index("confirm_new_ingredients") < step_ids.index("add_new_ingredients")
    assert step_ids.index("add_new_ingredients") < step_ids.index("confirm_finalize")
    assert step_ids.index("confirm_finalize") < step_ids.index("persist_build")
    check = next(s for s in wf["steps"] if s["id"] == "check_recipe_ingredients")
    assert check.get("branch", {}).get("ingredient_names_missing_empty") == "confirm_finalize"


def test_ingredient_sub_call_mode_defined():
    wf = get_workflow("add_ingredient_from_chat")
    modes = wf.get("invocation_modes") or {}
    assert "sub_call" in modes
    assert modes["sub_call"].get("on_duplicate") == "return_existing_slug"
    assert "confirm_create" in modes["sub_call"].get("skip_gates", [])
