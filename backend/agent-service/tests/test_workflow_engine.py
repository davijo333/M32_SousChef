# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# """Tests for workflow step state machine."""
#
# from langchain_core.messages import AIMessage, HumanMessage
#
# from agents.head.orchestration import resolve_workflow_consults
# from agents.head.workflow_engine import (
#     ADD_DISH,
#     WorkflowState,
#     advance_workflow_after_turn,
#     parse_workflow_state,
#     resolve_active_workflow,
#     try_start_workflow,
# )
#
#
# def test_try_start_add_dish():
#     state = {
#         "user_question": "Let's add a new dish Mango Smoothie",
#         "workflow_state": None,
#         "messages": [],
#     }
#     route, wf = try_start_workflow(state)
#     assert route is not None
#     assert route["consult_targets"] == ["create"]
#     assert wf is not None
#     assert wf.workflow_id == ADD_DISH
#     assert wf.step_id == "draft_recipe"
#     assert wf.locked_name == "Mango Smoothie"
#
#
# def test_draft_recipe_yes_at_kitchen_gate_goes_inventory():
#     wf = WorkflowState(ADD_DISH, "draft_recipe", "Banana Smoothie")
#     assistant = (
#         "### Banana Smoothie\n\n"
#         "Ingredients:\n- Banana — 2 each\n\n"
#         "Prep Steps:\n1. Blend.\n\n"
#         "Ready to add **Banana Smoothie** to Kitchen with the recipe and suggested add-ons?"
#     )
#     state = {
#         "user_question": "Yes",
#         "workflow_state": wf.to_dict(),
#         "messages": [
#             HumanMessage(content="Add Banana Smoothie"),
#             AIMessage(content=assistant),
#             HumanMessage(content="Yes"),
#         ],
#     }
#     route = resolve_active_workflow(state, wf)
#     assert route is not None
#     assert route["consult_targets"] == ["inventory"]
#     assert route.get("confirm_inventory") is True
#     assert route["workflow_state"]["stepId"] == "confirm_finalize"
#
#
# def test_active_workflow_yes_without_recipe_stays_creative():
#     wf = WorkflowState(ADD_DISH, "confirm_recipe", "Mango Smoothie", ["draft_recipe"])
#     state = {
#         "user_question": "Yes create a recipe",
#         "workflow_state": wf.to_dict(),
#         "messages": [
#             HumanMessage(content="Let's add dish Mango Smoothie"),
#             AIMessage(content="Would you like me to consult Creator?"),
#             HumanMessage(content="Yes create a recipe"),
#         ],
#     }
#     route = resolve_active_workflow(state, wf)
#     assert route is not None
#     assert route["consult_targets"] == ["create"]
#     assert route["workflow_state"]["stepId"] == "draft_recipe"
#
#
# def test_active_workflow_confirm_recipe_with_draft_goes_inventory():
#     assistant = (
#         "### Mango Smoothie\n\n"
#         "Ingredients:\n- Mango — 2 each\n\n"
#         "Prep Steps:\n1. Blend.\n\n"
#         "Please confirm if you'd like to proceed."
#     )
#     wf = WorkflowState(ADD_DISH, "confirm_recipe", "Mango Smoothie", ["draft_recipe"])
#     state = {
#         "user_question": "confirm",
#         "workflow_state": wf.to_dict(),
#         "confirm_inventory": False,
#         "messages": [
#             HumanMessage(content="Add dish Mango Smoothie"),
#             AIMessage(content=assistant),
#             HumanMessage(content="confirm"),
#         ],
#     }
#     route = resolve_active_workflow(state, wf)
#     assert route is not None
#     assert route["consult_targets"] == ["inventory"]
#     assert route.get("confirm_inventory") is True
#     assert route["workflow_state"]["stepId"] == "confirm_finalize"
#
#
# def test_advance_after_creative_draft():
#     wf = WorkflowState(ADD_DISH, "draft_recipe", "Mango Smoothie")
#     next_wf = advance_workflow_after_turn(
#         wf,
#         consult_results={"create": "Recipe draft..."},
#         thread_history=[],
#         kitchen_built=False,
#     )
#     assert next_wf is not None
#     assert next_wf.step_id == "confirm_recipe"
#
#
# def test_resolve_workflow_consults_uses_persisted_state():
#     state = {
#         "user_question": "Yes create a recipe",
#         "workflow_state": {
#             "workflowId": ADD_DISH,
#             "stepId": "confirm_recipe",
#             "lockedName": "Mango Smoothie",
#             "gatesPassed": ["draft_recipe"],
#         },
#         "messages": [
#             HumanMessage(content="Let's add dish Mango Smoothie"),
#             AIMessage(content="Draft..."),
#             HumanMessage(content="Yes create a recipe"),
#         ],
#     }
#     route = resolve_workflow_consults(state)
#     assert route is not None
#     assert route["consult_targets"] == ["create"]
#
#
# def test_try_start_add_dish_pick_without_name():
#     state = {
#         "user_question": "Lets add a new dish",
#         "workflow_state": None,
#         "messages": [],
#     }
#     route, wf = try_start_workflow(state)
#     assert route is not None
#     assert route["consult_targets"] == ["create"]
#     assert wf is not None
#     assert wf.workflow_id == ADD_DISH
#     assert wf.step_id == "pick_dish"
#     assert wf.locked_name == ""
#
#
# def test_sanitize_dish_brainstorm_closer():
#     from agents.head.reply_sanitizer import DISH_PICK_OPTIONS, sanitize_head_reply
#
#     raw = (
#         "I consulted the **Creator Agent**.\n\n"
#         "**Creator Agent**\n"
#         "### 1. Avocado Toast\n\nIngredients:\n- Bread\n\nPrep Steps:\n1. Toast.\n\n"
#         "### 2. Veggie Bowl\n\nIngredients:\n- Quinoa\n\nPrep Steps:\n1. Mix.\n\n"
#         "Let me know which dish you'd like to proceed with!\n\n"
#         "What would you like to do next?"
#     )
#     out = sanitize_head_reply(raw)
#     assert DISH_PICK_OPTIONS in out
#     assert "what would you like to do next" not in out.lower()
#     assert "let me know which dish" not in out.lower()
#     assert "confirm a dish or customize" in out.lower()
#
#
# def test_parse_workflow_state_snake_case():
#     wf = parse_workflow_state(
#         {"workflow_id": "add_dish_from_chat", "step_id": "draft_recipe", "locked_name": "Latte"}
#     )
#     assert wf is not None
#     assert wf.locked_name == "Latte"
#
#
# def test_pick_dish_yes_defaults_to_first_brainstorm_option():
#     brainstorm = (
#         "### 1. Avocado Spinach Toast\n\nIngredients:\n- Bread\n\nPrep Steps:\n1. Toast.\n\n"
#         "### 2. Veggie Bowl\n\nIngredients:\n- Quinoa\n\nPrep Steps:\n1. Cook.\n\n"
#         "Would you like to confirm a dish or customize more?"
#     )
#     wf = WorkflowState(ADD_DISH, "pick_dish", "")
#     state = {
#         "user_question": "Yes",
#         "workflow_state": wf.to_dict(),
#         "messages": [
#             HumanMessage(content="Lets add a new dish"),
#             AIMessage(content=brainstorm),
#             HumanMessage(content="Yes"),
#         ],
#     }
#     route = resolve_active_workflow(state, wf)
#     assert route is not None
#     assert route["consult_targets"] == ["create"]
#     assert route["workflow_state"]["lockedName"] == "Avocado Spinach Toast"
#     assert route["workflow_state"]["stepId"] == "draft_recipe"
#
#
# def test_advance_after_creative_sets_locked_name_from_draft():
#     wf = WorkflowState(ADD_DISH, "draft_recipe", "")
#     creative = (
#         "### Recipe for Avocado Spinach Toast\n\n"
#         "Ingredients:\n- Hass Avocado — 2 each\n\n"
#         "Prep Steps:\n1. Toast bread.\n"
#     )
#     next_wf = advance_workflow_after_turn(
#         wf,
#         consult_results={"create": creative},
#         thread_history=[],
#         kitchen_built=False,
#     )
#     assert next_wf is not None
#     assert next_wf.step_id == "confirm_recipe"
#     assert next_wf.locked_name == "Avocado Spinach Toast"
#
#
# def test_pick_dish_bare_yes_locks_first_brainstorm_dish():
#     brainstorm = (
#         "### 1. Avocado Spinach Toast\n\n"
#         "Description: Toast.\n\nIngredients:\n- Bread — 2 slices\n\nPrep Steps:\n1. Toast.\n\n"
#         "### 2. Veggie Bowl\n\nIngredients:\n- Quinoa\n\nPrep Steps:\n1. Mix.\n\n"
#         "Would you like to confirm a dish or customize more? (Yes/No/Customize)"
#     )
#     wf = WorkflowState(ADD_DISH, "pick_dish", "")
#     state = {
#         "user_question": "Yes",
#         "workflow_state": wf.to_dict(),
#         "messages": [
#             HumanMessage(content="Lets add a new dish"),
#             AIMessage(content=brainstorm),
#             HumanMessage(content="Yes"),
#         ],
#     }
#     route = resolve_active_workflow(state, wf)
#     assert route is not None
#     assert route["consult_targets"] == ["create"]
#     assert route["workflow_state"]["lockedName"] == "Avocado Spinach Toast"
#     assert route["workflow_state"]["stepId"] == "draft_recipe"
#
#
# def test_draft_recipe_yes_after_brainstorm_goes_inventory():
#     brainstorm = (
#         "### 1. Avocado Spinach Toast\n\nIngredients:\n- Bread — 2 slices\n\nPrep Steps:\n1. Toast.\n\n"
#         "### 2. Veggie Bowl\n\nIngredients:\n- Quinoa\n\nPrep Steps:\n1. Mix.\n"
#     )
#     recipe = (
#         "### Avocado Spinach Toast\n\n"
#         "Ingredients:\n- Hass Avocado — 2 each\n- Bread — 2 slices\n\n"
#         "Prep Steps:\n1. Toast bread.\n2. Top with avocado.\n\n"
#         "Visual brief: Rustic board.\n\n"
#         "Ready to add **Avocado Spinach Toast** to Kitchen with the recipe and suggested add-ons?"
#     )
#     wf = WorkflowState(ADD_DISH, "draft_recipe", "Avocado Spinach Toast")
#     state = {
#         "user_question": "Yes",
#         "workflow_state": wf.to_dict(),
#         "messages": [
#             HumanMessage(content="Lets add a new dish"),
#             AIMessage(content=brainstorm),
#             HumanMessage(content="Yes"),
#             AIMessage(content=recipe),
#             HumanMessage(content="Yes"),
#         ],
#     }
#     route = resolve_active_workflow(state, wf)
#     assert route is not None
#     assert route["consult_targets"] == ["inventory"]
#     assert route.get("confirm_inventory") is True
