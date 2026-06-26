"""Tests for query workflow catalog."""

from workflows.engine.loader import get_workflow

INVENTORY_QUERIES = [
    "inventory_on_hand",
    "inventory_low_stock",
    "inventory_expiring",
    "inventory_reorder_read",
    "inventory_search",
    "inventory_menu_lookup",
    "inventory_purchase_queue",
]

BUSINESS_QUERIES = [
    "business_sales_summary",
    "business_dish_pricing",
    "business_margin_rank",
    "business_promotion_read",
    "business_reorder_advice",
    "business_purchases_vs_cogs",
]

CREATIVE_QUERIES = [
    "creative_cues",
    "expiry_special",
    "promotion_special",
    "suggest_dish_addons",
    "creative_pantry_recipe",
]


def test_all_inventory_queries_catalogued():
    for wf_id in INVENTORY_QUERIES:
        wf = get_workflow(wf_id)
        assert wf is not None, wf_id
        assert wf.get("status") == "catalogued"
        assert wf.get("mode") == "read"


def test_all_business_queries_catalogued():
    for wf_id in BUSINESS_QUERIES:
        wf = get_workflow(wf_id)
        assert wf is not None, wf_id
        assert wf.get("status") == "catalogued"
        assert wf.get("mode") == "read"


def test_all_creative_queries_catalogued():
    for wf_id in CREATIVE_QUERIES:
        wf = get_workflow(wf_id)
        assert wf is not None, wf_id
        assert wf.get("status") == "catalogued"
        assert wf.get("mode") == "read"


def test_creative_cues_not_add_dish():
    wf = get_workflow("creative_cues")
    not_this = " ".join(wf.get("not_this_workflow") or [])
    assert "add_dish_from_chat" in not_this
    consult = next(s for s in wf["steps"] if s["id"] == "consult")
    assert "create" in str(consult.get("delegate"))


def test_inventory_on_hand_has_disambiguate():
    wf = get_workflow("inventory_on_hand")
    step_ids = [s["id"] for s in wf["steps"]]
    assert "disambiguate" in step_ids
    dis = next(s for s in wf["steps"] if s["id"] == "disambiguate")
    assert dis.get("gate") == "disambiguate"


def test_triage_route_catalogued():
    wf = get_workflow("route_chef_intent")
    assert wf is not None
    assert wf.get("status") == "catalogued"
    routing = wf.get("routing") or {}
    assert "read_inventory" in routing
    assert "write_addition" in routing


def test_no_legacy_query_stubs():
    assert get_workflow("inventory_stock_query") is None
    assert get_workflow("business_margin_query") is None
    assert get_workflow("creative_brainstorm") is None
