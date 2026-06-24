# Agents

Python **FastAPI** service at `services/agent/` (default `http://localhost:8000`).

Started with `npm run start:agents`.

| Agent | Doc | Trigger |
|-------|-----|---------|
| 1a Purchase Order Parser | [purchase-order-parser.md](./purchase-order-parser.md) | Order upload → `/parse-bill-pipeline` |
| 2a Item Normalizer | [item-normalizer.md](./item-normalizer.md) | Same pipeline — names, SKU, 2 images |
| Image suggestions | [image-suggestions.md](./image-suggestions.md) | Product photo search + filters |

The web app calls the agent from `POST /api/bills/parse`. **Process** (confirm) runs in TypeScript only — no second agent call.
