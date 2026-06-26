"""Tests for reply policy."""

from supervisor.reply_policy import CONFIRM_OPTIONS, confirm_closer, sanitize_reply
from domain.context import TurnContext
from supervisor.router import RouteDecision


def test_confirm_gate_ready_to_save():
    ctx = TurnContext(
        restaurant_id="r1",
        user_id="",
        chef_name="Chef",
        restaurant_name="Kitchen",
        user_message="yes",
        history=[],
        finance_period="week",
        cues_text="",
    )
    route = RouteDecision("add_dish_from_chat", "confirm_recipe", [], "answer")
    out = sanitize_reply("Recipe looks good.", ctx, route)
    assert "look good" in out
    assert "Proceed with ingredient linking" in out
    assert CONFIRM_OPTIONS in out


def test_confirm_closer_template():
    assert "Ready to save **Mango Smoothie** to Kitchen?" in confirm_closer("Mango Smoothie")


def test_link_addon_confirm_gate():
    from workflows.engine.state import WorkflowState

    ctx = TurnContext(
        restaurant_id="r1",
        user_id="",
        chef_name="Chef",
        restaurant_name="Kitchen",
        user_message="link it to pancakes",
        history=[],
        finance_period="week",
        cues_text="",
        workflow_state=WorkflowState(
            "link_addons_to_dish_chat",
            "confirm_link",
            locked_name="Pancakes",
            baggage={"addon_name": "glazed bananas"},
        ),
    )
    route = RouteDecision("link_addons_to_dish_chat", "confirm_link", [], "answer")
    out = sanitize_reply("Linking add-on glazed bananas to Pancakes.", ctx, route)
    assert "Ready to link" in out
    assert "glazed bananas" in out
    assert "Pancakes" in out
    assert CONFIRM_OPTIONS in out
    assert "recipe and suggested add-ons" not in out.lower()


def test_link_addon_confirm_gate_overrides_llm_ready_to_save():
    from workflows.engine.state import WorkflowState

    ctx = TurnContext(
        restaurant_id="r1",
        user_id="",
        chef_name="Chef",
        restaurant_name="Kitchen",
        user_message="link glazed bananas to pancakes",
        history=[],
        finance_period="week",
        cues_text="",
        workflow_state=WorkflowState(
            "link_addons_to_dish_chat",
            "confirm_link",
            locked_name="Pancakes",
            baggage={"addon_name": "glazed bananas"},
        ),
    )
    route = RouteDecision("link_addons_to_dish_chat", "confirm_link", [], "answer")
    out = sanitize_reply(
        "Linking add-on **glazed bananas** to **Pancakes**.\n\nReady to save this link to Kitchen?",
        ctx,
        route,
    )
    assert "Ready to link" in out
    assert CONFIRM_OPTIONS in out


def test_link_addon_ingredient_confirm_gate():
    from workflows.engine.state import WorkflowState

    ctx = TurnContext(
        restaurant_id="r1",
        user_id="",
        chef_name="Chef",
        restaurant_name="Kitchen",
        user_message="link bananas to glazed bananas",
        history=[],
        finance_period="week",
        cues_text="",
        workflow_state=WorkflowState(
            "link_addon_ingredients_chat",
            "confirm_link",
            locked_name="Glazed Bananas",
            baggage={"link_ingredient_name": "bananas"},
        ),
    )
    route = RouteDecision("link_addon_ingredients_chat", "confirm_link", [], "answer")
    out = sanitize_reply(
        "I will add bananas to the add-on glazed bananas.\n\nReady to save this dish to Kitchen now?",
        ctx,
        route,
    )
    assert "Ready to link" in out
    assert "bananas" in out
    assert "Glazed Bananas" in out or "glazed bananas" in out.lower()
    assert CONFIRM_OPTIONS in out
    assert "recipe and suggested add-ons" not in out.lower()
