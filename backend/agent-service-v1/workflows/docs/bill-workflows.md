# Bill workflows (catalog)

Runtime catalog: `catalog/bills.yaml`  
Golden source: archived on git branch `v0` (`agents/head/golden-workflows.yaml` bills section)

**Rule:** supplier **purchase orders first**, then POS **sales receipts**. One confirm gate (`confirm_bills`) before any `apply_inventory` process action.

## Workflows

| ID | When | Workers |
|----|------|---------|
| `upload_purchase_orders` | Chef attached supplier PDFs / ready PO `upload_batch` | Inventory |
| `upload_sales_orders` | Chef attached POS receipts / customer `upload_batch` | Business (prerequisite) → Inventory |
| `upload_mixed_bill_batch` | Mixed supplier + customer in one attach | Inventory → Business → Inventory |
| `process_purchase_bills` | Process queued POs (no new upload) | Inventory |
| `process_sales_bills` | Process queued sales receipts | Business → Inventory |

## Common write shape

```
intake → (ingest note: UI already parsed) → summarize (upload_bills)
       → prerequisite? (sales only — purchase_prerequisite)
       → confirm_bills → persist (process_purchase_bills | process_sales_bills)
       → completed
```

## Tools

| Step | Tool |
|------|------|
| Summarize batch | `upload_bills` summarize / batch_status |
| PO prerequisite read | `query_business` purchase_prerequisite |
| Sales queue read | `query_business` sales_queue |
| PO queue read | `query_inventory` purchase_queue |
| Persist PO | `apply_inventory` process_purchase_bills |
| Persist SO | `apply_inventory` process_sales_bills |

## Boundaries

| Chef intent | Workflow |
|-------------|----------|
| What's in the bill queue? (read) | `inventory_purchase_queue` query |
| Upload + process supplier invoices | `upload_purchase_orders` |
| Upload + process POS receipts | `upload_sales_orders` |
| Both in one attach | `upload_mixed_bill_batch` |
| "Process the POs" (already uploaded) | `process_purchase_bills` |
| "Process sales receipts" (already uploaded) | `process_sales_bills` |

## PO-before-SO

If `purchase_prerequisite` fails → `stop_po_first` handoff to `upload_purchase_orders`.  
Business **never** calls `process_sales_bills`; Inventory persists after chef confirms.

## Not in agent chat

File OCR/classify runs in the UI (`/classify-bill`, `/parse-bill-pipeline`) before the agent turn.  
The agent only summarizes `upload_batch` and confirms processing.

Chef only sees **Sous Chef**.
