# Upload orders

See [UI README](./README.md#upload-orders).

**Files:**

- `apps/web/src/app/upload-orders/page.tsx`
- `apps/web/src/components/BillUploadZone.tsx`

Each successful parse creates a `BillUpload` and a linked `PurchaseOrder`. After **Process**, the order moves to the PO table below the upload zone.

**API:** `GET /api/purchase-orders?status=processed`
