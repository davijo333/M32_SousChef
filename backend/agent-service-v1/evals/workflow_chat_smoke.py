#!/usr/bin/env python3
"""Live chat smoke tests — one isolated conversation per workflow."""

from __future__ import annotations

import json
import os
import sys
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient

ROOT = Path(__file__).resolve().parents[3]
load_dotenv(ROOT / ".env")

AGENT_URL = os.environ.get("AGENT_SERVICE_URL", "http://127.0.0.1:8000").rstrip("/")
MONGODB_URI = os.environ["MONGODB_URI"]
TEST_BILLS = ROOT / "test" / "bills"

RESTAURANT_ID = ""
USER_ID = ""


@dataclass
class TurnResult:
    ok: bool
    status: int
    reply: str
    workflow_id: str | None
    step_id: str | None
    triage_id: str | None
    pending_action: bool
    error: str = ""


@dataclass
class WorkflowTest:
    workflow_id: str
    opener: str
    followups: list[str] = field(default_factory=list)
    upload_batch: dict[str, Any] | None = None
    expect_cleared: bool = False
    notes: str = ""


def _mongo() -> Any:
    return MongoClient(MONGODB_URI).get_default_database()


def _load_ids() -> None:
    global RESTAURANT_ID, USER_ID
    db = _mongo()
    r = db.restaurants.find_one({})
    u = db.users.find_one({})
    if not r or not u:
        raise RuntimeError("No restaurant/user in MongoDB")
    RESTAURANT_ID = str(r["_id"])
    USER_ID = str(u["_id"])



def _chat_raw(
    message: str,
    *,
    history: list[dict[str, str]] | None = None,
    workflow_state: dict[str, Any] | None = None,
    upload_batch: dict[str, Any] | None = None,
) -> tuple[TurnResult, dict[str, Any] | None]:
    payload: dict[str, Any] = {
        "restaurant_id": RESTAURANT_ID,
        "user_id": USER_ID,
        "chef_name": "Chef",
        "restaurant_name": "Panera Cafe",
        "message": message,
        "history": history or [],
        "finance_period": "week",
    }
    if workflow_state:
        payload["workflow_state"] = workflow_state
    if upload_batch:
        payload["upload_batch"] = upload_batch

    try:
        resp = requests.post(f"{AGENT_URL}/chat", json=payload, timeout=120)
    except Exception as exc:
        return TurnResult(False, 0, "", None, None, None, False, str(exc)), workflow_state

    if resp.status_code != 200:
        return TurnResult(False, resp.status_code, resp.text[:500], None, None, None, False, resp.text[:300]), workflow_state

    data = resp.json()
    activity = data.get("activity") or {}
    wf_state = data.get("workflow_state") or {}
    triage = activity.get("triage") or {}
    reply = str(data.get("reply") or "").strip()
    tr = TurnResult(
        ok=bool(reply),
        status=resp.status_code,
        reply=reply,
        workflow_id=activity.get("workflow_id") or wf_state.get("workflowId"),
        step_id=activity.get("step_id") or wf_state.get("stepId"),
        triage_id=triage.get("workflow_id"),
        pending_action=bool(data.get("pending_action")),
    )
    return tr, data.get("workflow_state")


def _run_test(test: WorkflowTest) -> dict[str, Any]:
    history: list[dict[str, str]] = []
    workflow_state: dict[str, Any] | None = None
    turns: list[dict[str, Any]] = []
    messages = [test.opener, *test.followups]

    routed_ok = False
    cleared = False
    errors: list[str] = []
    last_tr: TurnResult | None = None

    for idx, msg in enumerate(messages):
        tr, workflow_state = _chat_raw(
            msg,
            history=history,
            workflow_state=workflow_state,
            upload_batch=test.upload_batch if idx == 0 else None,
        )
        last_tr = tr
        turns.append(
            {
                "message": msg,
                "workflow_id": tr.workflow_id,
                "step_id": tr.step_id,
                "triage_id": tr.triage_id,
                "pending_action": tr.pending_action,
                "reply_preview": tr.reply[:220].replace("\n", " "),
                "error": tr.error,
            }
        )
        if not tr.ok:
            errors.append(tr.error or "empty reply")
            break
        if idx == 0:
            ids = {x for x in (tr.workflow_id, tr.triage_id) if x}
            routed_ok = test.workflow_id in ids
            if not routed_ok:
                errors.append(f"expected {test.workflow_id}, got activity={tr.workflow_id} triage={tr.triage_id}")

        history.append({"role": "user", "content": msg})
        history.append({"role": "assistant", "content": tr.reply})
        if idx == len(messages) - 1 and workflow_state is None:
            cleared = True
        time.sleep(0.25)

    if test.expect_cleared and not cleared and not errors:
        if workflow_state is not None:
            errors.append(f"expected workflow to clear (still at {workflow_state.get('stepId')})")

    passed = routed_ok and not errors and last_tr is not None and last_tr.ok
    return {
        "workflow_id": test.workflow_id,
        "passed": passed,
        "routed_ok": routed_ok,
        "cleared": cleared,
        "errors": errors,
        "turns": turns,
        "notes": test.notes,
    }


def _bill_line_from_parsed(line: dict[str, Any]) -> dict[str, Any]:
    return {
        "rawName": line.get("rawName") or line.get("raw_name") or "item",
        "normalizedName": line.get("normalizedName") or line.get("normalized_name"),
        "quantity": float(line.get("quantity") or 1),
        "unit": line.get("unit") or "each",
        "unitPrice": float(line.get("unitPrice") or line.get("unit_price") or 0),
        "lineTotal": float(line.get("lineTotal") or line.get("line_total") or 0),
        "confidence": float(line.get("confidence") or 0.9),
        "suggestedCategory": line.get("suggestedCategory") or line.get("suggested_category") or "ingredient",
        "included": line.get("included", True),
    }


def _insert_pending_bill(bill_type: str, pdf_path: Path) -> str:
    with pdf_path.open("rb") as fh:
        files = {"file": (pdf_path.name, fh, "application/pdf")}
        data = {"bill_type": bill_type}
        resp = requests.post(f"{AGENT_URL}/parse-bill-pipeline", files=files, data=data, timeout=180)
    if resp.status_code != 200:
        raise RuntimeError(f"parse failed {pdf_path.name}: {resp.status_code} {resp.text[:200]}")
    parsed = resp.json()
    bill = parsed.get("bill") or {}
    lines = [_bill_line_from_parsed(row) for row in (bill.get("lines") or [])]
    doc = {
        "restaurantId": ObjectId(RESTAURANT_ID),
        "userId": ObjectId(USER_ID),
        "billType": bill_type,
        "vendor": bill.get("vendor") or ("Sysco" if bill_type == "supplier" else "POS"),
        "billDate": bill.get("billDate") or bill.get("bill_date"),
        "filename": pdf_path.name,
        "status": "pending_review",
        "lines": lines,
        "createdAt": datetime.now(timezone.utc),
        "updatedAt": datetime.now(timezone.utc),
    }
    oid = _mongo().billuploads.insert_one(doc).inserted_id
    return str(oid)


def _upload_batch(bill_type: str, bill_ids: list[str], filenames: list[str]) -> dict[str, Any]:
    return {
        "ready": len(bill_ids),
        "total": len(bill_ids),
        "failed": 0,
        "billType": bill_type,
        "state": "ready",
        "filenames": filenames,
        "readyBillIds": bill_ids,
    }


def _mixed_batch(supplier_ids: list[str], customer_ids: list[str], supplier_names: list[str], customer_names: list[str]) -> dict[str, Any]:
    return {
        "ready": len(supplier_ids) + len(customer_ids),
        "total": len(supplier_ids) + len(customer_ids),
        "failed": 0,
        "state": "ready",
        "slices": [
            {
                "billType": "supplier",
                "ready": len(supplier_ids),
                "failed": 0,
                "filenames": supplier_names,
                "readyBillIds": supplier_ids,
            },
            {
                "billType": "customer",
                "ready": len(customer_ids),
                "failed": 0,
                "filenames": customer_names,
                "readyBillIds": customer_ids,
            },
        ],
    }


def build_tests(*, supplier_bill_id: str, customer_bill_id: str, supplier_batch: dict, customer_batch: dict, mixed_batch: dict) -> list[WorkflowTest]:
    uid = uuid.uuid4().hex[:6]
    return [
        WorkflowTest("add_ingredient_from_chat", f"Add ingredient Test Spice {uid} to the pantry", ["Yes, go ahead"]),
        WorkflowTest("add_addon_from_chat", f"Add add-on Extra Pickles {uid} to the menu", ["Yes, go ahead"]),
        WorkflowTest("update_dish", "Change the sell price of Mango Paradise Smoothie to $17.50", ["Yes, confirm"]),
        WorkflowTest("update_ingredient", "Change reorder level for Butter Croissant to 25", ["Yes, confirm"]),
        WorkflowTest("update_addon", "Update add-on Bacon sell price to $2.75", ["Yes, confirm"]),
        WorkflowTest("link_dish_ingredients_chat", "Add honey to the Mango Paradise Smoothie recipe", ["Yes, go ahead"]),
        WorkflowTest("link_addon_ingredients_chat", "Add butter to the Bacon add-on recipe ingredients", ["Yes, go ahead"]),
        WorkflowTest("link_addons_to_dish_chat", "Link Sausage add-on to The Sunrise Stack dish", ["Yes, go ahead"]),
        WorkflowTest("inventory_on_hand", "How much mango do we have on hand?", expect_cleared=True),
        WorkflowTest("inventory_low_stock", "What's running low in the pantry?", expect_cleared=True),
        WorkflowTest("inventory_expiring", "What ingredients are expiring soon?", expect_cleared=True),
        WorkflowTest("inventory_reorder_read", "What's the reorder level for Butter Croissant?", expect_cleared=True),
        WorkflowTest("inventory_search", "Search pantry for yogurt", expect_cleared=True),
        WorkflowTest("inventory_menu_lookup", "Do we have Mango Paradise Smoothie on the menu?", expect_cleared=True),
        WorkflowTest("inventory_purchase_queue", "What purchase bills are waiting to process?", expect_cleared=True),
        WorkflowTest("business_sales_summary", "How were sales this week?", expect_cleared=True),
        WorkflowTest("business_dish_pricing", "What's the margin on Mango Paradise Smoothie?", expect_cleared=True),
        WorkflowTest("business_margin_rank", "Which dishes have the best margins?", expect_cleared=True),
        WorkflowTest("business_promotion_read", "What should I promote this week?", expect_cleared=True),
        WorkflowTest("business_reorder_advice", "What reorder level should I use for mango?", expect_cleared=True),
        WorkflowTest("business_purchases_vs_cogs", "How do supplier purchases compare to ticket COGS?", expect_cleared=True),
        WorkflowTest("creative_cues", "Give me an idea for today's special", expect_cleared=True),
        WorkflowTest("expiry_special", "What can I make with expiring ingredients?", expect_cleared=True),
        WorkflowTest("promotion_special", "Suggest a limited-time promo for breakfast", expect_cleared=True),
        WorkflowTest("suggest_dish_addons", "What add-ons go well with The Sunrise Stack?", expect_cleared=True),
        WorkflowTest("creative_pantry_recipe", "What can I make with eggs and bacon?", expect_cleared=True),
        WorkflowTest("upload_purchase_orders", "I uploaded supplier bills — please summarize", upload_batch=supplier_batch, followups=["Yes, go ahead"]),
        WorkflowTest("upload_sales_orders", "I uploaded sales receipts — ready to process", upload_batch=customer_batch, followups=["Yes, go ahead"]),
        WorkflowTest("upload_mixed_bill_batch", "Process my mixed PO and sales batch", upload_batch=mixed_batch, followups=["Yes, go ahead"]),
        WorkflowTest("process_purchase_bills", "Process the purchase bills in the queue", followups=["Yes, confirm"], notes=f"uses pending bill {supplier_bill_id}"),
        WorkflowTest("process_sales_bills", "Process the sales receipts in the queue", followups=["Yes, confirm"], notes=f"uses pending bill {customer_bill_id}"),
    ]


def main() -> int:
    _load_ids()
    health = requests.get(f"{AGENT_URL}/health", timeout=10)
    if health.status_code != 200:
        print(f"Agent not healthy: {health.status_code}")
        return 1

    print("Preparing pending bills from test/bills …")
    supplier_path = TEST_BILLS / "supplier" / "Bill-1_Sysco.pdf"
    customer_path = TEST_BILLS / "customer" / "1.c_bill.pdf"
    supplier_id = _insert_pending_bill("supplier", supplier_path)
    customer_id = _insert_pending_bill("customer", customer_path)
    supplier_id2 = _insert_pending_bill("supplier", TEST_BILLS / "supplier" / "Bill-3_Costco.pdf")
    print(f"  supplier pending: {supplier_id}, {supplier_id2}")
    print(f"  customer pending: {customer_id}")

    supplier_batch = _upload_batch("supplier", [supplier_id2], ["Bill-3_Costco.pdf"])
    customer_batch = _upload_batch("customer", [customer_id], ["1.c_bill.pdf"])
    mixed_batch = _mixed_batch([supplier_id2], [customer_id], ["Bill-3_Costco.pdf"], ["1.c_bill.pdf"])

    tests = build_tests(
        supplier_bill_id=supplier_id,
        customer_bill_id=customer_id,
        supplier_batch=supplier_batch,
        customer_batch=customer_batch,
        mixed_batch=mixed_batch,
    )

    results: list[dict[str, Any]] = []
    failed: list[str] = []

    for i, test in enumerate(tests, 1):
        print(f"\n[{i}/{len(tests)}] {test.workflow_id} …")
        result = _run_test(test)
        results.append(result)
        status = "PASS" if result["passed"] else "FAIL"
        print(f"  {status} — {result.get('errors') or result['turns'][-1]['reply_preview'][:120]}")
        if not result["passed"]:
            failed.append(test.workflow_id)

    out_path = Path(__file__).parent / "workflow_smoke_results.json"
    out_path.write_text(json.dumps(results, indent=2))
    print("\n" + "=" * 60)
    print(f"Done: {len(tests) - len(failed)}/{len(tests)} passed")
    if failed:
        print("FAILED:")
        for wf in failed:
            print(f"  - {wf}")
    else:
        print("All workflows passed routing smoke tests.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
