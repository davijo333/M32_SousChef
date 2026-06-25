# 1a — Purchase Order Parser

**File:** `backend/agent-service/supplier_bill_parser.py`

**Endpoint:** `POST /parse-bill-pipeline` (multipart file + `bill_type=supplier`)

## Output

Structured order JSON:

- `vendor`, `billDate`, `invoiceNumber`
- `lines[]`: `rawName`, `quantity`, `unit`, `unitPrice`, `lineTotal`, `confidence`

Each line is classified as ingredient for the purchase-order flow. Low-confidence lines can be excluded on review.

## Downstream

Parsed lines feed **2a Item Normalizer** in the same pipeline response under `enriched[]`.
