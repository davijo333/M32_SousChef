# Sous Chef — Web app

Next.js app: UI, NextAuth, API route handlers, and dashboard chat.

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
├── app/              # Pages and API routes (thin handlers)
│   ├── dashboard/    # Inventory, Business, Create + chat dock
│   ├── recipes/      # Recipe tabs (grouped by class)
│   ├── kitchen-control/
│   ├── upload-orders/
│   └── api/          # bills, catalog, dashboard, recipes, seed
├── components/       # React UI
└── lib/              # UI-only: agent icons, hooks, chat markdown

../../backend/api/    # Shared models + domain services (imported via @backend/*)
```

## Docs

- [docs/UI/](../../docs/UI/) — pages and flows
- [agents/](../../agents/) — chat agent profiles
- [tools/Tool_Index.md](../../tools/Tool_Index.md) — core chat tools
- [docs/DB/](../../docs/DB/) — MongoDB collections

## Production build

```bash
npm run build
npm run start
```

Deploy root directory: `apps/web` (e.g. Vercel). Set `AGENT_SERVICE_URL` to the deployed `backend/agent-service-v1`.
