# Sous Chef

Kitchen management for **cafés**, **restaurants**, and **home cooks** — track what you have, what you sell, and what each dish costs.

Upload a supplier invoice or receipt photo and Sous Chef reads the line items and updates your pantry. Check what's running low, build recipes with food cost and margin, and get a quick read on sales — all from one app. Chat in plain language when you want help ("What's expiring this week?" or "Should I raise the price on the club sandwich?").

## Who it's for

| | |
|---|---|
| **Cafés & restaurants** | Stay on top of stock, margins, and menu changes without spreadsheets. Process purchase orders and daily sales in minutes. |
| **Home kitchens** | Track pantry items, plan around expiry dates, and keep recipes with simple cost notes for meal prep or hosting. |

## Features

- **Upload orders** — Supplier bills and sales receipts parsed into stock and sales history
- **Kitchen control** — Ingredients, dishes, and add-ons in one view
- **Recipes** — Food cost, margin, and menu status (active, suggested, retired)
- **Dashboard** — Low stock, expiring items, sales snapshot, and daily special ideas
- **Chat** — Ask Sous Chef for reorder advice, recipe ideas, or help updating the menu

## Agentic AI architecture

Sous Chef is built as a **multi-agent system**: one **supervisor agent** coordinates three **specialist agents**, each with its own tools and domain. You talk to one chat interface; the supervisor decides who to consult, confirms before any write, and synthesizes the answer.

```
You → Sous Chef (supervisor)
         ├─ Inventory Agent   pantry, catalog, bills
         ├─ Business Agent    sales, margins, pricing
         └─ Creative Agent    recipes, specials, menu ideas
```

### Sous Chef — supervisor agent

The default chat persona. It **orchestrates** workflows rather than mutating data directly — triaging your request, calling the right specialist, and asking you to confirm before stock or menu changes are saved. It reads a high-level kitchen snapshot and routes tasks like *“process this Sysco invoice”* or *“add a mango smoothie to the menu”* through defined **golden workflows**.

### Specialist agents

| Agent | Role | Examples |
|-------|------|----------|
| **Inventory** | Pantry, dishes, add-ons, purchase & sales orders | “What’s low on stock?”, “Set reorder level for milk”, “Process uploaded bills” |
| **Business** | Sales, food cost, margins, reorder advice | “How are margins this week?”, “What should I charge for the new sandwich?” |
| **Creative** | Specials, recipe drafts, add-on pairings | “Suggest a seasonal latte”, “What add-ons fit the club sandwich?” |

You can **hand off** from Sous Chef to a specialist mid-conversation (and back) without losing context. The UI and chat work in parallel — every action agents can take is also available manually on Kitchen control, Upload orders, and Recipes.

Behind the chat layer, **background workers** handle bill parsing, item normalization, recipe linking, and image suggestions. Agents invoke these through tools; they are not separate chat personas.

More detail: [docs/Agents.md](docs/Agents.md) · [agents/README.md](agents/README.md)

## Quick start

```bash
cp .env.example .env
npm install && cd apps/web && npm install && cd ../..

npm run connect:mongodb   # MongoDB on :27017
npm run start:agents      # Agent service v1 on :8000 (replaces agent-service)
npm run start:schef       # Web app on :3000
```

Open [http://localhost:3000](http://localhost:3000). Set `MONGODB_URI`, `NEXTAUTH_SECRET`, and `OPENAI_API_KEY` in `.env` (see [`.env.example`](.env.example)).

## Documentation

Full setup, architecture, and UI reference: [docs/README.md](docs/README.md)
