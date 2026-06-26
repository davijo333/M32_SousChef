# `upload_bills`

| Field | Value |
|-------|-------|
| **Primary agent** | Inventory |
| **Used by** | **Inventory** |
| **Tier** | Upload |
| **Built?** | Yes |
| **Confirm required?** | No |

## Summary

Ingest PDF/PNG bills: validate, classify, parse, route to PO or SO queue.

## Dual path

**Manual:** Upload orders page; chat attachments (batch queue + handoff)

**Chat:** Chef invokes `upload_bills` with an `action` parameter (see internal actions).

## Wraps

`chat-bill-upload-queue.ts; tools/core/bills.py; POST /api/bills/parse`

## Internal actions

The LLM sees **one** tool; the backend routes to:

- `validate_upload_batch`
- `classify_bill_document`
- `handoff_purchase_bills`
- `handoff_sales_bills`
- `summarize_upload_handoff`

## Build status

**Yes** — consolidated `@tool` shipped in `backend/agent-service-v1/tools/core/`.

Read-only or navigation — no confirmation.

## See also

- [Tool Index](../Tool_Index.md)
- [Inventory agent](../../../agents/inventory.md)
