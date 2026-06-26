"""Tests for bill workflow catalog."""

from workflows.engine.loader import get_workflow, load_catalog

BILL_WORKFLOW_IDS = [
    "upload_purchase_orders",
    "upload_sales_orders",
    "upload_mixed_bill_batch",
    "process_purchase_bills",
    "process_sales_bills",
]


def test_all_bill_workflows_catalogued():
    for wf_id in BILL_WORKFLOW_IDS:
        wf = get_workflow(wf_id)
        assert wf is not None, wf_id
        assert wf.get("status") == "catalogued", wf_id
        assert wf.get("mode") == "write"


def test_shared_bills_policy_defined():
    policy = load_catalog()["shared"].get("bills_policy") or {}
    assert policy.get("order") == "purchase_orders_before_sales_orders"
    assert "inventory" in (policy.get("workers") or {})


def test_upload_po_confirm_before_persist():
    wf = get_workflow("upload_purchase_orders")
    step_ids = [s["id"] for s in wf["steps"]]
    assert step_ids.index("confirm_process") < step_ids.index("persist")
    confirm = next(s for s in wf["steps"] if s["id"] == "confirm_process")
    assert confirm.get("gate") == "confirm_bills"
    persist = next(s for s in wf["steps"] if s["id"] == "persist")
    assert "process_purchase_bills" in (persist.get("tool") or "")


def test_upload_sales_has_prerequisite():
    wf = get_workflow("upload_sales_orders")
    step_ids = [s["id"] for s in wf["steps"]]
    assert "prerequisite" in step_ids
    assert "stop_po_first" in step_ids
    prereq = next(s for s in wf["steps"] if s["id"] == "prerequisite")
    assert prereq.get("on_block") == "stop_po_first"
    stop = next(s for s in wf["steps"] if s["id"] == "stop_po_first")
    assert stop.get("handoff_workflow") == "upload_purchase_orders"


def test_mixed_batch_po_before_so():
    wf = get_workflow("upload_mixed_bill_batch")
    step_ids = [s["id"] for s in wf["steps"]]
    assert step_ids.index("persist_purchase") < step_ids.index("persist_sales")
    assert step_ids.index("prerequisite") < step_ids.index("persist_sales")


def test_process_sales_prerequisite_first():
    wf = get_workflow("process_sales_bills")
    step_ids = [s["id"] for s in wf["steps"]]
    assert step_ids.index("prerequisite") < step_ids.index("queue_read")
    assert step_ids.index("confirm_process") < step_ids.index("persist")


def test_triage_includes_bills():
    wf = get_workflow("route_chef_intent")
    routing = wf.get("routing") or {}
    assert "write_bills" in routing
    assert "upload_purchase_orders" in routing["write_bills"]
