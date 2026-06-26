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
