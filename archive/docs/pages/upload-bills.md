# Upload Bills

Core differentiator. Bills are the source of truth for cold-starting inventory and sales data.

## Purpose

Upload supplier invoices and customer sales receipts so agents can extract line items. Users review and confirm before data is saved.

## Route

`/upload-bills`

(Future: `/upload-bills/:id/review`, `/upload-bills/history`)

## Layout (MVP scaffold)

Split upload screen:

```
┌──────────────────────────────────────────────────────────┐
│  Upload Bills                                            │
├──────────────────────────┬───────────────────────────────┤
│  Upload Ingredients Bill │  Upload Customer Bill         │
│  (left half)             │  (right half)                 │
│  Supplier invoices       │  Sales receipts / checks      │
│  [ drop zone ]           │  [ drop zone ]                │
└──────────────────────────┴───────────────────────────────┘
```

## Bill types

| Type | Examples | Feeds |
|------|----------|-------|
| **Ingredients bill** | Sysco, Costco, local dairy | Raw materials (stock IN) |
| **Customer bill** | Square, Toast, daily Z-report | Sales / dish demand (stock OUT) |

## Flow (Stage 2)

1. Upload PDF or image
2. Bill Parser agent (1a) extracts lines
3. Item Normalizer (1b) cleans names
4. Review screen — confirm / edit / skip lines
5. Commit to MongoDB → inventory engine updates

## Related pages

- [Dashboard](./dashboard.md)
- [Kitchen Control](./kitchen-control.md)
- Supplier parser → [1a-supplier-bill-parser](../agents/1a-supplier-bill-parser/README.md)
- Customer parser → [1b-customer-bill-parser](../agents/1b-customer-bill-parser/README.md)
