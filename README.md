# Sous Chef — Purchase orders & ingredients

Upload wholesaler invoices → parse with AI → Process to add/update ingredient inventory.

## Quick start

```bash
npm run connect:mongodb   # MongoDB on :27017
npm run start:agents      # FastAPI agent on :8000
npm run start:schef       # Next.js on :3000
```

Copy env: `cp .env.example .env` and `cp .env apps/web/.env.local`

Set `OPENAI_API_KEY`, `NEXTAUTH_SECRET`, `MONGODB_URI`.

## Scope (this branch)

| In scope | Out of scope (see `archive/`) |
|----------|-------------------------------|
| Purchase order upload (PDF/PNG) | Sales orders, chat, full dashboard |
| Process → ingredient stock | Menu items, recipes, promotions |
| 1a Purchase Order Parser | Sales order parser, recipe agents |
| 2a Ingredient Normalizer | LangGraph (planned) |
| Ingredients Kitchen UI | Composio, Google OAuth |

## Flow

1. **Upload** purchase order files (PDF or PNG from Costco, Sysco, etc. — up to 5 at a time)
2. Agent parses + finds 2 images per new ingredient
3. **Process** — upsert ingredients, qty, images to MongoDB + R2
4. View pantry on **Kitchen control** — tap an ingredient for details, images, and last order info

See [`docs/`](docs/README.md) for page, agent, and database reference.

## Project layout

```
M32_SousChef/
├── apps/web/           # Next.js — upload UI, ingredients, API
├── services/agent/     # FastAPI — purchase order parse + normalizer
├── test/
│   ├── inventory/      # Catalog JSON — source for PO/SO bill content
│   ├── bills/          # Generated PDF/PNG test invoices
│   └── scripts/        # generate-bills.py
├── docs/               # UI, Agents, DB reference
├── archive/            # Full pre-slim codebase
├── storage/r2/         # Order files + catalog images
├── scripts/            # start-web, reset-db, retest-upload
└── docker-compose.yml  # MongoDB
```

### Test bills

```bash
python3 -m pip install -r test/scripts/requirements.txt
python3 test/scripts/generate-bills.py
```

Fixtures land in `test/bills/supplier/` (`Bill-1_Sysco.pdf` …) and `test/bills/customer/`. Line content is driven by [`test/inventory/`](../inventory/) — edit those JSON files, then regenerate bills.

Docs: [`docs/Inventory/`](docs/Inventory/), [`docs/Recipes/`](docs/Recipes/).

## Archive

The previous full app (chat, sales orders, docs, tests) lives in [`archive/`](archive/README.md).
