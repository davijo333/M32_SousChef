"""Tests for workflow executor — resolve and advance."""

from __future__ import annotations

from types import SimpleNamespace

from workflows.engine.executor import advance_after_turn, resolve_step_for_turn
from workflows.engine.state import WorkflowState
from workflows.engine.transitions import parse_dish_idea_names


def _ctx(
    message: str,
    *,
    workflow_state: WorkflowState | None = None,
    catalog_draft: dict | None = None,
    upload_batch: dict | None = None,
    consult_results: dict | None = None,
    history: list | None = None,
):
    return SimpleNamespace(
        restaurant_id="r1",
        user_id="u1",
        chef_name="Chef",
        restaurant_name="Test Kitchen",
        user_message=message,
        history=history or [],
        finance_period="week",
        cues_text="",
        workflow_state=workflow_state,
        catalog_draft=catalog_draft,
        upload_batch=upload_batch,
        recipe_build=None,
        confirm_inventory=False,
        confirm_business=False,
        confirm_suggestion=False,
        consult_results=consult_results or {},
        triage_workflow_id=None,
        triage_locked_name="",
    )


def test_start_add_dish_named_routes_to_duplicate_check():
    step, state = resolve_step_for_turn(_ctx("Add a mango smoothie to the menu"))
    assert step is not None
    assert step.workflow_id == "add_dish_from_chat"
    assert step.step_id == "duplicate_check"
    assert step.delegate == ["inventory"]
    assert state is not None
    assert state.locked_name == "mango smoothie"


def test_start_inventory_query_routes_to_consult():
    step, state = resolve_step_for_turn(_ctx("What's low stock right now?"))
    assert step is not None
    assert step.workflow_id == "inventory_low_stock"
    assert step.step_id == "consult"
    assert step.delegate == ["inventory"]
    assert state is not None


def test_gate_confirm_advances_to_next_delegate_step():
    state = WorkflowState("add_dish_from_chat", "confirm_recipe", locked_name="Mango Smoothie")
    step, new_state = resolve_step_for_turn(_ctx("Yes, go ahead", workflow_state=state))
    assert step is not None
    assert step.step_id == "check_recipe_ingredients"
    assert step.delegate == ["inventory"]
    assert new_state is not None
    assert new_state.step_id == "check_recipe_ingredients"


def test_gate_reject_returns_to_draft_recipe():
    state = WorkflowState("add_dish_from_chat", "confirm_recipe", locked_name="Mango Smoothie")
    step, _ = resolve_step_for_turn(_ctx("No, change the recipe", workflow_state=state))
    assert step is not None
    assert step.step_id == "draft_recipe"
    assert step.delegate == ["create"]


def test_advance_after_draft_recipe_moves_to_confirm_recipe():
    state = WorkflowState("add_dish_from_chat", "draft_recipe", locked_name="Mango Smoothie")
    ctx = _ctx(
        "",
        workflow_state=state,
        consult_results={"create": "### Mango Smoothie\n\nIngredients..."},
    )
    next_state = advance_after_turn(ctx, workflow_id="add_dish_from_chat", step_id="draft_recipe")
    assert next_state is not None
    assert next_state.step_id == "confirm_recipe"
    assert next_state.locked_name == "Mango Smoothie"
    assert "draft_recipe" in next_state.gates_passed


def test_advance_missing_ingredients_branches_to_confirm_new():
    state = WorkflowState("add_dish_from_chat", "check_recipe_ingredients", locked_name="Mango Smoothie")
    ctx = _ctx(
        "",
        workflow_state=state,
        consult_results={"inventory": "ingredient_names_missing: [milk, honey]"},
    )
    next_state = advance_after_turn(ctx, workflow_id="add_dish_from_chat", step_id="check_recipe_ingredients")
    assert next_state is not None
    assert next_state.step_id == "confirm_new_ingredients"


def test_advance_no_missing_skips_to_confirm_finalize():
    state = WorkflowState("add_dish_from_chat", "check_recipe_ingredients", locked_name="Mango Smoothie")
    ctx = _ctx(
        "",
        workflow_state=state,
        consult_results={"inventory": "ingredient_names_missing: []"},
    )
    next_state = advance_after_turn(ctx, workflow_id="add_dish_from_chat", step_id="check_recipe_ingredients")
    assert next_state is not None
    assert next_state.step_id == "confirm_finalize"


def test_advance_query_clears_workflow():
    state = WorkflowState("inventory_low_stock", "consult")
    ctx = _ctx("", workflow_state=state, consult_results={"inventory": "Low: milk, eggs"})
    next_state = advance_after_turn(ctx, workflow_id="inventory_low_stock", step_id="consult")
    assert next_state is None


def test_duplicate_check_clears_on_stop():
    state = WorkflowState("add_dish_from_chat", "duplicate_check", locked_name="Mango Smoothie")
    ctx = _ctx(
        "",
        workflow_state=state,
        consult_results={"inventory": "duplicate_slug: mango-smoothie already exists"},
    )
    next_state = advance_after_turn(ctx, workflow_id="add_dish_from_chat", step_id="duplicate_check")
    assert next_state is None


def test_duplicate_clear_advances_to_confirm_identity():
    state = WorkflowState("add_dish_from_chat", "duplicate_check", locked_name="Mango Smoothie")
    ctx = _ctx("", workflow_state=state, consult_results={"inventory": "no duplicate — clear to proceed"})
    next_state = advance_after_turn(ctx, workflow_id="add_dish_from_chat", step_id="duplicate_check")
    assert next_state is not None
    assert next_state.step_id == "confirm_dish_identity"


def test_advance_summarize_empty_stops_bills():
    state = WorkflowState("upload_purchase_orders", "summarize")
    ctx = _ctx(
        "",
        workflow_state=state,
        consult_results={"inventory": "No purchase bills in queue."},
    )
    next_state = advance_after_turn(ctx, workflow_id="upload_purchase_orders", step_id="summarize")
    assert next_state is None


def test_advance_prerequisite_blocks_sales():
    state = WorkflowState("upload_sales_orders", "prerequisite")
    ctx = _ctx(
        "",
        workflow_state=state,
        consult_results={
            "business": "No processed supplier purchases yet. Process purchase bills in Inventory first.",
        },
    )
    next_state = advance_after_turn(ctx, workflow_id="upload_sales_orders", step_id="prerequisite")
    assert next_state is None


def test_advance_prerequisite_clear_advances_sales():
    state = WorkflowState("upload_sales_orders", "prerequisite")
    ctx = _ctx(
        "",
        workflow_state=state,
        consult_results={"business": "At least one supplier purchase bill has been processed — sales bills can be confirmed."},
    )
    next_state = advance_after_turn(ctx, workflow_id="upload_sales_orders", step_id="prerequisite")
    assert next_state is not None
    assert next_state.step_id == "confirm_process"


def test_advance_consult_multiple_matches_disambiguate():
    state = WorkflowState("inventory_on_hand", "consult", locked_name="milk")
    ctx = _ctx(
        "",
        workflow_state=state,
        consult_results={"inventory": "Multiple matches for milk — did you mean whole milk or oat milk?"},
    )
    next_state = advance_after_turn(ctx, workflow_id="inventory_on_hand", step_id="consult")
    assert next_state is not None
    assert next_state.step_id == "disambiguate"


def test_disambiguate_gate_advances_to_answer():
    state = WorkflowState("inventory_on_hand", "disambiguate", locked_name="milk")
    step, new_state = resolve_step_for_turn(_ctx("whole milk", workflow_state=state))
    assert step is not None
    assert step.step_id == "answer"
    assert new_state is None


def test_upload_batch_starts_supplier_workflow():
    batch = {
        "ready": 2,
        "billType": "supplier",
        "readyBillIds": ["abc", "def"],
        "filenames": ["sysco.pdf"],
    }
    ctx = _ctx("go ahead", upload_batch=batch)
    step, state = resolve_step_for_turn(ctx)
    assert step is not None
    assert step.workflow_id == "upload_purchase_orders"
    assert step.step_id == "summarize"
    assert state is not None
    assert state.baggage.get("bills_ready") is True


def test_advance_suggest_dish_ideas_moves_to_pick_dish():
    ideas = (
        "### 1. **Avocado Spinach Toast**\nDesc\n\n"
        "### 2. **Veggie Omelette**\nDesc\n\n"
        "### 3. **Smoothie Bowl**\nDesc"
    )
    state = WorkflowState("add_dish_from_chat", "suggest_dish_ideas")
    ctx = _ctx("", workflow_state=state, consult_results={"create": ideas})
    next_state = advance_after_turn(ctx, workflow_id="add_dish_from_chat", step_id="suggest_dish_ideas")
    assert next_state is not None
    assert next_state.step_id == "pick_dish"
    assert next_state.baggage.get("dish_idea_names") == [
        "Avocado Spinach Toast",
        "Veggie Omelette",
        "Smoothie Bowl",
    ]


def test_dish_pick_yes_advances_to_duplicate_check():
    state = WorkflowState(
        "add_dish_from_chat",
        "pick_dish",
        baggage={
            "dish_idea_names": ["Avocado Spinach Toast", "Veggie Omelette", "Smoothie Bowl"],
        },
    )
    step, new_state = resolve_step_for_turn(_ctx("Yes", workflow_state=state))
    assert step is not None
    assert step.step_id == "duplicate_check"
    assert step.delegate == ["inventory"]
    assert new_state is not None
    assert new_state.locked_name == "Avocado Spinach Toast"


def test_parse_dish_idea_names_plain_numbered_list():
    ideas = (
        "Here are three breakfast dish ideas:\n\n"
        "1. Avocado Spinach Toast\n"
        "- Description: Creamy avocado spread\n\n"
        "2. Veggie Omelette\n"
        "- Description: Fluffy omelette\n\n"
        "3. Spinach and Tomato Breakfast Wrap\n"
        "- Description: A warm tortilla"
    )
    assert parse_dish_idea_names(ideas) == [
        "Avocado Spinach Toast",
        "Veggie Omelette",
        "Spinach and Tomato Breakfast Wrap",
    ]


def test_dish_pick_yes_2_from_history():
    ideas_reply = (
        "1. Avocado Spinach Toast\n- Description: toast\n\n"
        "2. Veggie Omelette\n- Description: eggs\n\n"
        "3. Spinach Wrap\n- Description: wrap"
    )
    state = WorkflowState("add_dish_from_chat", "pick_dish")
    history = [
        SimpleNamespace(role="user", content="breakfast"),
        SimpleNamespace(role="assistant", content=ideas_reply),
    ]
    step, new_state = resolve_step_for_turn(_ctx("Yes 2", workflow_state=state, history=history))
    assert step is not None
    assert step.step_id == "duplicate_check"
    assert new_state is not None
    assert new_state.locked_name == "Veggie Omelette"
    assert new_state.baggage.get("dish_idea_names") == [
        "Avocado Spinach Toast",
        "Veggie Omelette",
        "Spinach Wrap",
    ]


def test_dish_pick_number_2_advances_to_duplicate_check():
    state = WorkflowState(
        "add_dish_from_chat",
        "pick_dish",
        baggage={
            "dish_idea_names": ["Avocado Spinach Toast", "Veggie Omelette", "Smoothie Bowl"],
        },
    )
    step, new_state = resolve_step_for_turn(_ctx("2", workflow_state=state))
    assert step is not None
    assert step.step_id == "duplicate_check"
    assert new_state is not None
    assert new_state.locked_name == "Veggie Omelette"


def test_dish_pick_2_after_prior_failed_pick_prompt():
    ideas_reply = (
        "Here are the dish ideas for breakfast:\n\n"
        "1. Avocado Spinach Toast\n- Description: toast\n\n"
        "2. Veggie Omelette\n- Description: eggs\n\n"
        "3. Spinach Wrap\n- Description: wrap\n\n"
        "Which dish — **1**, **2**, or **3**?"
    )
    state = WorkflowState("add_dish_from_chat", "pick_dish")
    history = [
        SimpleNamespace(role="user", content="breakfast"),
        SimpleNamespace(role="assistant", content=ideas_reply),
        SimpleNamespace(role="user", content="2"),
        SimpleNamespace(
            role="assistant",
            content="Which dish — **1**, **2**, or **3**? (Yes/No/Customize)",
        ),
    ]
    step, new_state = resolve_step_for_turn(_ctx("2", workflow_state=state, history=history))
    assert step is not None
    assert step.step_id == "duplicate_check"
    assert new_state is not None
    assert new_state.locked_name == "Veggie Omelette"


def test_confirm_new_ingredients_yes_advances_to_finalize():
    state = WorkflowState(
        "add_dish_from_chat",
        "confirm_new_ingredients",
        locked_name="Avocado Spinach Salad",
        baggage={"recipe_draft_raw": "### Avocado Spinach Salad\n\nIngredients:\n- Olive Oil: 2 tbsp"},
    )
    step, new_state = resolve_step_for_turn(_ctx("yes", workflow_state=state))
    assert step is not None
    assert step.step_id == "confirm_finalize"
    assert new_state is not None
    assert new_state.step_id == "confirm_finalize"


def test_confirm_finalize_yes_advances_to_persist_build():
    state = WorkflowState(
        "add_dish_from_chat",
        "confirm_finalize",
        locked_name="Avocado Spinach Salad",
        baggage={"recipe_draft_raw": "### Avocado Spinach Salad\n\nIngredients:\n- Olive Oil: 2 tbsp"},
    )
    step, new_state = resolve_step_for_turn(_ctx("yes", workflow_state=state))
    assert step is not None
    assert step.step_id == "persist_build"
    assert step.delegate == ["inventory"]


def test_confirm_recipe_yes_advances_to_finalize_prompt_step():
    """After recipe confirm, same turn lands on confirm_finalize (next yes saves)."""
    state = WorkflowState(
        "add_dish_from_chat",
        "confirm_recipe",
        locked_name="Veggie Omelette",
        baggage={"recipe_draft_raw": "### Veggie Omelette\n\n**Ingredients**\n- Eggs 2 each"},
    )
    step, mid_state = resolve_step_for_turn(_ctx("yes", workflow_state=state))
    assert step is not None
    assert step.step_id == "check_recipe_ingredients"
    ctx = _ctx(
        "yes",
        workflow_state=mid_state,
        consult_results={"inventory": "ingredient_names_missing: []"},
    )
    next_state = advance_after_turn(
        ctx,
        workflow_id="add_dish_from_chat",
        step_id="check_recipe_ingredients",
    )
    assert next_state is not None
    assert next_state.step_id == "confirm_finalize"


def test_confirm_recipe_yes_advances_to_ingredient_check():
    state = WorkflowState(
        "add_dish_from_chat",
        "confirm_recipe",
        locked_name="Avocado Spinach Toast",
    )
    step, mid_state = resolve_step_for_turn(_ctx("yes", workflow_state=state))
    assert step is not None
    assert step.step_id == "check_recipe_ingredients"
    assert step.delegate == ["inventory"]
    assert mid_state is not None
    ctx = _ctx(
        "yes",
        workflow_state=mid_state,
        consult_results={"inventory": "ingredient_names_missing: []"},
    )
    next_state = advance_after_turn(
        ctx,
        workflow_id="add_dish_from_chat",
        step_id="check_recipe_ingredients",
    )
    assert next_state is not None
    assert next_state.step_id == "confirm_finalize"


def test_dish_pick_blocks_bare_yes_without_ideas():
    state = WorkflowState("add_dish_from_chat", "pick_dish")
    step, new_state = resolve_step_for_turn(_ctx("Yes", workflow_state=state))
    assert step is not None
    assert step.step_id == "pick_dish"
    assert new_state is not None
    assert not new_state.locked_name


def test_cancel_clears_active_workflow():
    state = WorkflowState("add_dish_from_chat", "confirm_recipe", locked_name="Mango Smoothie")
    step, new_state = resolve_step_for_turn(_ctx("never mind", workflow_state=state))
    assert step is None
    assert new_state is None

