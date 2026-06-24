# Sous Chef

AI-assisted kitchen management for cafés and restaurants: upload purchase and sales orders, manage pantry and menu, build recipes, and get insights from dashboard agents.

## Quick start

```bash
cp .env.example .env
cp .env apps/web/.env.local   # or symlink — web app reads repo-root .env via start script

npm install
cd apps/web && npm install && cd ../..

npm run connect:mongodb   # MongoDB on :27017
npm run start:agents      # FastAPI agents on :8000
npm run start:schef       # Next.js on :3000
```

Open [http://localhost:3000](http://localhost:3000), sign up, and set your kitchen name.

### Required environment

Set in `.env` (see [`.env.example`](.env.example)):

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | MongoDB connection |
| `NEXTAUTH_SECRET` | Session signing (`openssl rand -base64 32`) |
| `OPENAI_API_KEY` | Bill parsing and chat assistants |
| `AGENT_SERVICE_URL` | FastAPI service (default `http://localhost:8000`) |

Optional: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for Google sign-in.

## npm scripts

Run from the **repo root**:

| Script | Description |
|--------|-------------|
| `npm run connect:mongodb` | Start MongoDB via Docker Compose |
| `npm run start:agents` | Start Python agent service (`:8000`) |
| `npm run start:schef` | Start Next.js web app (`:3000`) |
| `npm run dev` | Mongo + Next.js dev server |
| `npm run build` | Production build of the web app |
| `npm run regenerate:bills` | Regenerate test purchase/sales bill PDFs & PNGs |
| `npm run reset:db` | Wipe MongoDB and local `storage/r2/` files |
| `npm run retest:upload` | Sign in, seed, and parse all test bills via API |

## App overview

| Page | Route | What it does |
|------|-------|----------------|
| **Dashboard** | `/dashboard` | Inventory, business analytics, and creative sections + **Sous Chef** chat dock |
| **Upload orders** | `/upload-orders` | Purchase orders (wholesaler invoices) and sales orders (POS receipts) |
| **Kitchen control** | `/kitchen-control` | Pantry, dishes, add-ons — edit catalog and photos |
| **Recipes** | `/recipes` | New, active, suggested, and inactive recipes (grouped by dish class) |

### Dashboard agents

- **Sous Chef** — floating chat dock (bottom center) on the dashboard; routes questions and can hand off to specialists.
- **Inventory / Business / Creative** — section tabs with dedicated agent branding; chat connects via **Connect to … Agent** when Sous Chef delegates.
- Up to **5 saved chat sessions**; attach up to **5 files** per message in Sous Chef chat.

See [docs/Agents/README.md](docs/Agents/README.md) for agents and [Tool_Index](docs/Agentic_Tools/Tool_Index.md) for chat tools.

### Upload flow

1. **Choose files** — up to **10** PDF/PNG files in the queue at once (purchase or sales tab).
2. Files parse one at a time via the agent (`POST /api/bills/parse`).
3. Click **Process** to apply stock (purchase) or record sales (customer).
4. Processed orders appear in the table below; new catalog items can be reviewed on Kitchen control.

Process **purchase orders before sales orders** so dish recipes link to pantry stock.

### Menu classifications

| Class | Label | Examples (test data) |
|-------|--------|----------------------|
| `sandwich` | Signature Sandwich | Sunrise Stack, Farmer's Double |
| `byo-sandwich` | BYO Sandwich | Build-Your-Own Bagel, Classic Bagel |
| `coffee` / `tea` / `juice` | Beverages | Hot Coffee, English Breakfast Tea |

Details: [docs/Recipes/classifications.md](docs/Recipes/classifications.md).

## Test data

### 1. Generate bill fixtures

Bills are built from [`test/inventory/`](test/inventory/) JSON (ingredients, dishes, purchase/sales order lines).

```bash
python3 -m pip install -r test/scripts/requirements.txt
python3 test/scripts/recalculate-pricing.py   # optional — refresh costs & sell prices
npm run regenerate:bills
```

Output:

- `test/bills/supplier/` — `Bill-1_Sysco.pdf`, … (18 wholesaler files)
- `test/bills/customer/` — `1.c_bill.pdf`, … (16 POS files)

See [`test/bills/manifest.json`](test/bills/manifest.json) for the full file list.

**Date windows** (relative to the day you generate or load):

| Data | Range | Field |
|------|--------|--------|
| Seed / demo kitchen | today − 37d → today − 7d | `seedDay` 0…30 |
| Bill fixtures | today − 7d → today | `billDay` 0…7 |
| Ingredient expiry | today + N days | `expiryDaysFromNow` |

Details: [`test/inventory/README.md`](test/inventory/README.md), [`test/scripts/README.md`](test/scripts/README.md).

### 2. Load demo kitchen

From the **Dashboard** → **Load test data**, or:

```bash
curl -X POST 'http://localhost:3000/api/seed?force=1' -b cookies.txt
```

Then upload bills from **Upload orders** and click **Process**.

### 3. Full upload retest

With web + agents running:

```bash
npm run retest:upload
```

## Project layout

```
M32_SousChef/
├── apps/web/              # Next.js — UI, API routes, MongoDB models
├── services/agent/        # FastAPI — bill parse, LangChain chat agents, image suggestions
├── test/
│   ├── inventory/       # Catalog + order JSON (source of truth for bills)
│   ├── bills/           # Generated PDF/PNG fixtures
│   └── scripts/         # generate-bills.py, recalculate-pricing.py
├── docs/                  # UI, agents, DB, inventory, recipes reference
├── storage/r2/            # Local mirror of catalog images + uploaded bill files
├── scripts/               # start-web, reset-db, retest-upload
└── docker-compose.yml     # MongoDB
```

## Documentation

- [`docs/README.md`](docs/README.md) — doc index
- [`docs/UI/README.md`](docs/UI/README.md) — pages and flows
- [`docs/Agents/README.md`](docs/Agents/README.md) — 4 chat agents (one file each)
- [`docs/Agentic_Tools/Tool_Index.md`](docs/Agentic_Tools/Tool_Index.md) — 9 core tools (8 shipped · 1 partial)
- [`docs/Agentic_Tools/tools/`](docs/Agentic_Tools/tools/) — one file per core tool
- [`docs/Agentic_Tools/Development.md`](docs/Agentic_Tools/Development.md) — LangGraph architecture
- [`docs/DB/README.md`](docs/DB/README.md) — MongoDB collections
- [`docs/Recipes/`](docs/Recipes/) — recipe workflow and classifications
- [`storage/r2/README.md`](storage/r2/README.md) — image and bill file layout
