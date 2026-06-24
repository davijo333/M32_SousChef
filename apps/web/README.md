# Sous Chef — Web app

Next.js 15 app: UI, NextAuth, MongoDB API routes, and dashboard chat.

## Run locally

From the **repo root** (recommended):

```bash
npm run start:schef
```

Or from this directory:

```bash
npm install
npm run dev
```

Requires MongoDB and `.env` — see [../../README.md](../../README.md).

## Structure

```
src/
├── app/              # Pages and API routes
│   ├── dashboard/    # Inventory, Business, Create + chat dock
│   ├── recipes/      # Recipe tabs (grouped by class)
│   ├── kitchen-control/
│   ├── upload-orders/
│   └── api/          # bills, catalog, dashboard, recipes, seed
├── components/       # UI including SousChefChatDock, DashboardChefChat
├── lib/              # Chat, handoff, catalog, recipe pipeline
└── models/           # Mongoose schemas
```

## Docs

- [docs/UI/](../../docs/UI/) — pages and flows
- [docs/Agentic_Tools/](../../docs/Agentic_Tools/) — agents and chat
- [docs/DB/](../../docs/DB/) — MongoDB collections

## Production build

```bash
npm run build
npm run start
```

Deploy root directory: `apps/web` (e.g. Vercel).
