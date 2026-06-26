"""Add-on catalog list and unified menu catalog lookup."""

from __future__ import annotations

from unittest.mock import patch

from domain.context import TurnContext
from specialists.direct_read import menu_catalog_lookup_reply
from workflows.engine.intent import match_workflow_start
from workflows.engine.state import WorkflowState


def test_addon_list_query_routes_to_menu_lookup():
    hits = match_workflow_start("what are the add-ons we have")
    assert hits
    assert hits[0][0] == "inventory_menu_lookup"


def test_addon_list_typo_spacing_routes():
    hits = match_workflow_start("what are the add -on we have")
    assert hits
    assert hits[0][0] == "inventory_menu_lookup"


@patch("tools.core.reads.read_menu")
def test_addon_list_returns_catalog(mock_read_menu):
    mock_read_menu.return_value = (
        "- Sausage (addon-sausage, protein): sell $2.00\n"
        "- Bacon (addon-bacon, protein): sell $1.50"
    )
    ctx = TurnContext(
        restaurant_id="507f1f77bcf86cd799439011",
        user_id="507f1f77bcf86cd799439012",
        chef_name="Chef",
        restaurant_name="Test",
        user_message="what are the add-ons we have",
        history=[],
        finance_period="week",
        cues_text="",
        workflow_state=WorkflowState("inventory_menu_lookup", "consult"),
    )

    result = menu_catalog_lookup_reply(ctx, "")

    assert "Sausage" in result
    assert "Bacon" in result
    mock_read_menu.assert_called_once()
    assert mock_read_menu.call_args.args[1] == "addons"


@patch("tools.core.catalog_reads.format_catalog_search")
def test_menu_lookup_searches_dishes_addons_and_ingredients(mock_catalog_search):
    mock_catalog_search.return_value = (
        "Pantry:\n**Honey** (`ing-honey`)\n- **On hand:** 2.00 each\n\n"
        "Add-ons:\n**glazed bananas** (`addon-glazed-bananas`) — Add-on"
    )
    ctx = TurnContext(
        restaurant_id="507f1f77bcf86cd799439011",
        user_id="507f1f77bcf86cd799439012",
        chef_name="Chef",
        restaurant_name="Test",
        user_message="do we have glazed bananas?",
        history=[],
        finance_period="week",
        cues_text="",
        workflow_state=WorkflowState("inventory_menu_lookup", "consult"),
    )

    result = menu_catalog_lookup_reply(ctx, "glazed bananas")

    assert "glazed bananas" in result
    mock_catalog_search.assert_called_once_with("507f1f77bcf86cd799439011", "glazed bananas", limit=12)
