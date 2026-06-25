"""Tests for deterministic Sous Chef orchestration."""

from agents.head.orchestration import (
    detect_addon_workflow_message,
    detect_pantry_add_zero_confirm,
    format_orchestration_reply,
    resolve_workflow_consults,
)


def test_detect_pantry_add_zero_confirm():
    assert detect_pantry_add_zero_confirm("No add as ingredients with 0 qty for now")
    assert detect_pantry_add_zero_confirm("create pantry ingredients at quantity 0")
    assert not detect_pantry_add_zero_confirm("order mangoes from supplier")


def test_detect_addon_workflow_message():
    assert detect_addon_workflow_message("What add-ons go with the club sandwich?")
    assert detect_addon_workflow_message("suggest modifiers for the latte")
    assert not detect_addon_workflow_message("process purchase orders")


def test_resolve_workflow_consults_kitchen_build_drafts_creative():
    state = {
        "user_question": "build a recipe for the mango smoothie",
        "catalog_draft": {"itemType": "dish", "name": "Mango Smoothie"},
        "confirm_suggestion": False,
        "confirm_inventory": False,
    }
    route = resolve_workflow_consults(state)
    assert route is not None
    assert route["consult_targets"] == ["create"]


def test_resolve_workflow_consults_addon_suggestion_creative():
    state = {
        "user_question": "what add-ons for the house latte?",
        "catalog_draft": {"itemType": "dish", "name": "House Latte"},
        "confirm_suggestion": False,
        "confirm_inventory": False,
    }
    route = resolve_workflow_consults(state)
    assert route is not None
    assert route["consult_targets"] == ["create"]


def test_resolve_workflow_consults_pantry_add_for_dish():
    state = {
        "user_question": "add ingredients with qty 0 for now",
        "catalog_draft": {"itemType": "dish", "name": "Mango Smoothie"},
        "confirm_suggestion": False,
        "confirm_inventory": False,
    }
    route = resolve_workflow_consults(state)
    assert route is not None
    assert route["route_mode"] == "consult"
    assert route["consult_targets"] == ["inventory"]
    assert route.get("confirm_inventory") is True


def test_format_orchestration_reply_no_hallucinated_done():
    state = {
        "consult_results": {
            "inventory": "Draft recipe plan ready — pick store products for mango.",
        },
        "pending_action": None,
        "recipe_build": {"dishName": "Mango Smoothie", "status": "selecting"},
    }
    reply = format_orchestration_reply(state)
    assert "Inventory Agent" in reply or "inventory" in reply.lower()
    assert "Done" not in reply
    assert "created" not in reply.lower() or "pick store" in reply.lower()
