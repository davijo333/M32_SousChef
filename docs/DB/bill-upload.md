# BillUpload (order upload session)

**Model:** `apps/web/src/models/BillUpload.ts`  
**Collection:** `billuploads`

Temporary session for an uploaded **purchase order** (or sales order in archive) between upload and Process.

> **Naming:** User-facing term is *purchase order* / *sales order*. The Mongo collection and model name `BillUpload` are kept for backward compatibility. `billType: "supplier"` = purchase order; `"customer"` = sales order.

## Fields

| Field | Type | Notes |
|-------|------|-------|
| `restaurantId`, `userId` | ObjectId | Scope |
| `billType` | string | `supplier` (purchase order) or `customer` (sales order) |
| `vendor`, `billDate`, `invoiceNumber` | string | Parsed header |
| `filename`, `mimeType` | string | Original file |
| `fileR2Key`, `fileUrl` | string? | Stored file |
| `status` | string | `pending_review` → `confirmed` |
| `lines` | array | Parsed lines with match flags |
| `pipelineEnriched` | array? | Agent 2a output cached on document |

## Related

Each upload has one [PurchaseOrder](./purchase-order.md) (`billUploadId`).
