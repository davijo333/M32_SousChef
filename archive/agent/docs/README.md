# Sous Chef Agent — Docs

Mirrors [`docs/agents/`](../../docs/agents/README.md) at repo root. Runtime code lives in this directory.

## Agents

| Stage | Doc | Code |
|-------|-----|------|
| **1a** Supplier Bill Parser | [1a-supplier-bill-parser](./1a-supplier-bill-parser/README.md) | `supplier_bill_parser.py` |
| **1b** Customer Bill Parser | [1b-customer-bill-parser](./1b-customer-bill-parser/README.md) | `customer_bill_parser.py` |
| **2a** Ingredient Normalizer | [2a-ingredient-normalizer](./2a-ingredient-normalizer/README.md) | `item_normalizer.py`, `image_suggestions.py` |
| **2b** Dish Inventory | [2b-dish-inventory](./2b-dish-inventory/README.md) | `recipe_researcher.py`, `recipe_linker.py` |

Orchestration: `bill_pipeline.py`, `catalog_prepare.py`

## Input formats

- **PDF** — first page → PNG (PyMuPDF)
- **PNG / JPEG** — direct vision input

## Concurrency

- `BILL_PIPELINE_PARALLEL=5` — up to 5 bills parsed concurrently
- Web upload sends **5 parse requests at a time**

## Endpoints

| Endpoint | Agent |
|----------|-------|
| `POST /parse-supplier-bill` | 1a |
| `POST /parse-customer-bill` | 1b |
| `POST /parse-bill-pipeline` | 1a or 1b |
| `POST /prepare-catalog-batch` | 2a / 2b |
| `POST /link-recipe` | 2b |

## Run locally

```bash
npm run start:agents
```

Service: `http://localhost:8000`
