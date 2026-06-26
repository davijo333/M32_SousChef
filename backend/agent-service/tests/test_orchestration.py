# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# """Tests for deterministic Sous Chef orchestration."""
#
# from agents.head.orchestration import (
#     detect_addon_workflow_message,
#     detect_pantry_add_zero_confirm,
#     format_orchestration_reply,
#     resolve_workflow_consults,
# )
#
#
# def test_detect_pantry_add_zero_confirm():
#     assert detect_pantry_add_zero_confirm("No add as ingredients with 0 qty for now")
#     assert detect_pantry_add_zero_confirm("create pantry ingredients at quantity 0")
#     assert not detect_pantry_add_zero_confirm("order mangoes from supplier")
#
#
# def test_detect_addon_workflow_message():
#     assert detect_addon_workflow_message("What add-ons go with the club sandwich?")
#     assert detect_addon_workflow_message("suggest modifiers for the latte")
#     assert not detect_addon_workflow_message("process purchase orders")
#
#
# def test_resolve_workflow_consults_kitchen_build_drafts_creative():
#     state = {
#         "user_question": "build a recipe for the mango smoothie",
#         "catalog_draft": {"itemType": "dish", "name": "Mango Smoothie"},
#         "confirm_suggestion": False,
#         "confirm_inventory": False,
#     }
#     route = resolve_workflow_consults(state)
#     assert route is not None
#     assert route["consult_targets"] == ["create"]
#
#
# def test_resolve_workflow_consults_addon_suggestion_creative():
#     state = {
#         "user_question": "what add-ons for the house latte?",
#         "catalog_draft": {"itemType": "dish", "name": "House Latte"},
#         "confirm_suggestion": False,
#         "confirm_inventory": False,
#     }
#     route = resolve_workflow_consults(state)
#     assert route is not None
#     assert route["consult_targets"] == ["create"]
#
#
# def test_resolve_workflow_consults_pantry_add_for_dish():
#     state = {
#         "user_question": "add ingredients with qty 0 for now",
#         "catalog_draft": {"itemType": "dish", "name": "Mango Smoothie"},
#         "confirm_suggestion": False,
#         "confirm_inventory": False,
#     }
#     route = resolve_workflow_consults(state)
#     assert route is not None
#     assert route["route_mode"] == "consult"
#     assert route["consult_targets"] == ["inventory"]
#     assert route.get("confirm_inventory") is True
#
#
# def test_resolve_workflow_consults_save_confirm_routes_inventory():
#     from langchain_core.messages import AIMessage, HumanMessage
#
#     assistant = (
#         "### Menu Name: Creamy Banana Smoothie\n\n"
#         "Ingredients:\n"
#         "- Banana — 2 each\n"
#         "- Whole Milk — 1 cup\n\n"
#         "Prep Steps:\n"
#         "1. Peel the bananas.\n"
#         "2. Blend until smooth.\n"
#     )
#     state = {
#         "user_question": "save it",
#         "confirm_suggestion": False,
#         "confirm_inventory": False,
#         "messages": [
#             HumanMessage(content="Add Dish Banana Smoothie"),
#             AIMessage(content=assistant),
#             HumanMessage(content="save it"),
#         ],
#     }
#     route = resolve_workflow_consults(state)
#     assert route is not None
#     assert route["consult_targets"] == ["inventory"]
#     assert route.get("confirm_inventory") is True
#
#
# def test_format_orchestration_reply_no_hallucinated_done():
#     state = {
#         "consult_results": {
#             "inventory": "Draft recipe plan ready — pick store products for mango.",
#         },
#         "pending_action": None,
#         "recipe_build": {"dishName": "Mango Smoothie", "status": "selecting"},
#     }
#     reply = format_orchestration_reply(state)
#     assert "Inventory Agent" in reply or "inventory" in reply.lower()
#     assert "Done" not in reply
#     assert "created" not in reply.lower() or "pick store" in reply.lower()
#
#
# def test_format_orchestration_reply_no_margin_during_creative_draft():
#     state = {
#         "consult_results": {
#             "create": (
#                 "### Menu Name: Watermelon Cooler\n\n"
#                 "Ingredients:\n- Watermelon — 2 cups\n\n"
#                 "Please confirm the kitchen build for the Watermelon Cooler."
#             ),
#         },
#         "catalog_draft": {"itemType": "dish", "name": "Watermelon Cooler"},
#         "pending_action": None,
#         "recipe_build": None,
#         "messages": [],
#     }
#     reply = format_orchestration_reply(state)
#     assert "margin pass" not in reply.lower()
#     assert "business agent" not in reply.lower() or "consulted" in reply.lower()
#     assert "(Yes/No/Update Instructions)" in reply
#     assert "what would you like to do next" not in reply.lower()
#
#
# def test_apply_kitchen_build_confirm_closer_strips_stacked_next_step():
#     from agents.head.reply_sanitizer import apply_kitchen_build_confirm_closer
#
#     raw = (
#         "I consulted the **Creator Agent**.\n\n"
#         "**Creator Agent**\n### Mango Smoothie\n\n"
#         "Please confirm the kitchen build for the Mango Smoothie.\n\n"
#         "What would you like to do next?"
#     )
#     reply = apply_kitchen_build_confirm_closer(raw, "Mango Smoothie")
#     assert "what would you like to do next" not in reply.lower()
#     assert "(Yes/No/Update Instructions)" in reply
#     assert "**Mango Smoothie**" in reply
#
#
# def test_format_orchestration_reply_margin_after_inventory_build():
#     state = {
#         "consult_results": {
#             "inventory": "Created dish **Watermelon Cooler** — open **Kitchen Control** to review.",
#         },
#         "catalog_draft": {"itemType": "dish", "name": "Watermelon Cooler"},
#         "pending_action": None,
#         "recipe_build": None,
#         "messages": [],
#     }
#     reply = format_orchestration_reply(state)
#     assert "margin pass" in reply.lower()
#     assert "watermelon cooler" in reply.lower()
#
#
# def test_detect_price_update_request():
#     from agents.head.orchestration import detect_price_update_request
#
#     assert detect_price_update_request("Update Watermelon Cooler price to $15")
#     assert not detect_price_update_request("What is the price of Watermelon Cooler?")
#
#
# def test_detect_price_adjustment_confirm_with_dish_in_message():
#     from agents.head.orchestration import detect_price_adjustment_confirm
#
#     history = [
#         {"role": "user", "content": "Update Watermelon Cooler price to $15"},
#         {
#             "role": "assistant",
#             "content": "Update **Watermelon Cooler** sell price to **$15.00**?\n\nSay **confirm** to apply.",
#         },
#     ]
#     assert detect_price_adjustment_confirm("confirm update", history)
#
#
# def test_detect_price_adjustment_confirm_cleared_after_apply():
#     from agents.head.orchestration import detect_price_adjustment_confirm
#
#     history = [
#         {"role": "user", "content": "Update Banana Smoothie price to $25"},
#         {
#             "role": "assistant",
#             "content": "Update **Banana Smoothie** sell price to **$25.00**?\n\nSay **confirm** to apply.",
#         },
#         {"role": "user", "content": "confirm"},
#         {"role": "assistant", "content": "Updated **Banana Smoothie** sell price to $25.00."},
#         {
#             "role": "user",
#             "content": 'update reorder level of "Super Crema Espresso Beans" to 10lb',
#         },
#     ]
#     assert not detect_price_adjustment_confirm("confirm", history)
#
#
# def test_detect_reorder_threshold_confirm_after_preview():
#     from agents.head.orchestration import (
#         detect_price_adjustment_confirm,
#         detect_reorder_threshold_confirm,
#     )
#
#     history = [
#         {
#             "role": "user",
#             "content": 'update reorder level of "Super Crema Espresso Beans" to 20lb',
#         },
#         {
#             "role": "assistant",
#             "content": "Update pantry ingredient **Super Crema Espresso Beans** reorder level to **20** lb?\n\nSay **confirm** to apply.",
#         },
#     ]
#     assert detect_reorder_threshold_confirm("confirm", history)
#     assert not detect_price_adjustment_confirm("confirm", history)
#
#
# def test_resolve_workflow_consults_reorder_update_inventory():
#     state = {
#         "user_question": 'update reorder level of "Super Crema Espresso Beans" to 10lb',
#         "confirm_suggestion": False,
#         "confirm_inventory": False,
#     }
#     route = resolve_workflow_consults(state)
#     assert route is not None
#     assert route["consult_targets"] == ["inventory"]
#
#
# def test_detect_add_dish_intent():
#     from agents.head.orchestration import detect_add_dish_intent
#
#     assert detect_add_dish_intent("Add dish Banana Smoothie") == "Banana Smoothie"
#     assert detect_add_dish_intent("Update selling price to $16") == ""
#
#
# def test_resolve_workflow_consults_add_dish_creative():
#     state = {
#         "user_question": "Let's add dish Watermelon Cooler",
#         "confirm_suggestion": False,
#         "confirm_inventory": False,
#     }
#     route = resolve_workflow_consults(state)
#     assert route is not None
#     assert route["consult_targets"] == ["create"]
#
#
# def test_resolve_workflow_consults_pricing_lock_not_creative_for_margin():
#     state = {
#         "user_question": "What's the margin on Watermelon Cooler?",
#         "catalog_draft": {"itemType": "dish", "name": "Watermelon Cooler", "source": "pricing"},
#         "confirm_suggestion": False,
#         "confirm_inventory": False,
#     }
#     route = resolve_workflow_consults(state)
#     assert route is not None
#     assert route["consult_targets"] == ["business"]
#
#
# def test_resolve_workflow_consults_update_dish_inventory_only():
#     state = {
#         "user_question": "update the dish description for Watermelon Cooler",
#         "catalog_draft": {"itemType": "dish", "name": "Watermelon Cooler"},
#         "confirm_suggestion": False,
#         "confirm_inventory": False,
#     }
#     route = resolve_workflow_consults(state)
#     assert route is not None
#     assert route["consult_targets"] == ["inventory"]
#
#
# def test_detect_kitchen_workflow_excludes_dish_update():
#     from agents.head.orchestration import detect_kitchen_workflow_message
#
#     assert not detect_kitchen_workflow_message("update the dish description")
#     assert not detect_kitchen_workflow_message("Update selling price to $16")
