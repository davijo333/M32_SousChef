"""Menu vs pantry routing for ambiguous 'do we have' queries."""

from __future__ import annotations

from unittest.mock import patch

from domain.context import TurnContext
from specialists.direct_read import invoke_step_tool
from workflows.engine.intent import match_workflow_start
from workflows.engine.loader import get_workflow
from workflows.engine.state import WorkflowState
from workflows.engine.transitions import find_step


def test_do_we_have_smoothies_routes_to_menu_lookup():
    hits = match_workflow_start("do we have smoothies")
    assert hits
    assert hits[0][0] == "inventory_menu_lookup"


def test_do_we_have_mango_on_hand_stays_pantry():
    hits = match_workflow_start("how much mango do we have on hand")
    assert hits
    assert hits[0][0] == "inventory_on_hand"


@patch("tools.core.catalog_reads.format_catalog_search")
def test_pantry_step_redirects_to_menu_for_smoothies(mock_catalog_search):
    mock_catalog_search.return_value = (
        "Dishes:\n**Mango Paradise Smoothie** (`dish-mango-paradise-smoothie`) — Dish\n"
        "- **Sell price (menu):** $18.00"
    )
    wf = get_workflow("inventory_on_hand")
    step = find_step(wf, "consult")
    ctx = TurnContext(
        restaurant_id="507f1f77bcf86cd799439011",
        user_id="507f1f77bcf86cd799439012",
        chef_name="Chef",
        restaurant_name="Test",
        user_message="do we have smoothies",
        history=[],
        finance_period="week",
        cues_text="",
        workflow_state=WorkflowState("inventory_on_hand", "consult"),
    )

    result = invoke_step_tool(ctx, step)

    assert "Mango Paradise Smoothie" in result
    mock_catalog_search.assert_called_once()
