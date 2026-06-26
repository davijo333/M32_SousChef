"""Direct read consult for query workflows."""

from __future__ import annotations

from unittest.mock import patch

from domain.context import TurnContext
from domain.messages import TurnMessage
from specialists.direct_read import try_direct_read
from workflows.engine.state import WorkflowState


def _ctx(message: str) -> TurnContext:
    return TurnContext(
        restaurant_id="507f1f77bcf86cd799439011",
        user_id="507f1f77bcf86cd799439012",
        chef_name="Chef",
        restaurant_name="Test",
        user_message=message,
        history=[],
        finance_period="week",
        cues_text="",
        workflow_state=WorkflowState("inventory_menu_lookup", "consult"),
    )


@patch("tools.core.catalog_reads.format_catalog_search")
def test_menu_lookup_direct_read_uses_normalized_query(mock_catalog_search):
    mock_catalog_search.return_value = (
        "Dishes:\n**Mango Paradise Smoothie** (`dish-mango-paradise-smoothie`) — Dish\n"
        "- **Sell price (menu):** $18.00"
    )

    result = try_direct_read(_ctx("do we have mango dishes"), "consult")

    assert result is not None
    assert "Mango Paradise Smoothie" in result
    mock_catalog_search.assert_called_once()
    assert mock_catalog_search.call_args.args[1] == "mango"
