"""Tests for v1 tool policy fixes."""

from __future__ import annotations

from tools.core.writes import CoreToolContext, PendingAction


def test_pending_action_supports_ingredient_purchase_fields():
    action = PendingAction(
        kind="update_ingredient",
        slug="milk-2pct",
        lastPurchasePrice=4.25,
        lastOrderedQty=12,
    )
    dumped = action.model_dump()
    assert dumped["lastPurchasePrice"] == 4.25
    assert dumped["lastOrderedQty"] == 12


def test_finalize_confirm_uses_inventory_flag():
    ctx = CoreToolContext(confirm_inventory=True, confirm_suggestion=False)
    from tools.core.factory import _catalog_confirmed

    assert _catalog_confirmed(ctx) is True


def test_inventory_tool_list_includes_query_kitchen():
    from tools.core.factory import make_core_tools_for_agent

    ctx = CoreToolContext()
    tools = make_core_tools_for_agent("inventory", restaurant_id="r1", ctx=ctx)
    names = [t.name for t in tools]
    assert "query_kitchen" in names
    assert "query_inventory" in names
    assert "apply_menu" in names


def test_create_worker_is_read_only_tools():
    from tools.core.factory import make_core_tools_for_agent

    ctx = CoreToolContext()
    tools = make_core_tools_for_agent("create", restaurant_id="r1", ctx=ctx)
    names = {t.name for t in tools}
    assert names == {"query_menu", "query_inventory"}
