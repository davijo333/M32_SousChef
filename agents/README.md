# Agents

Four **chat agents** chefs talk to, plus **background workers** they never chat with directly.

Manual UI always works in parallel — see [dual path](../tools/README.md#dual-path).

Overview doc: [docs/Agents.md](../docs/Agents.md) · Architecture: [docs/Architecture.md](../docs/Architecture.md)

---

## Chat agents

| Agent | Context | Dashboard | Doc | Core tools |
|-------|---------|-----------|-----|------------|
| **Sous Chef** | `head` | Floating chat dock | [sous-chef.md](./sous-chef.md) | [`query_kitchen`](../tools/tools/query_kitchen.md), [`orchestrate`](../tools/tools/orchestrate.md) |
| **Inventory Agent** | `inventory` | Dashboard → Inventory | [inventory.md](./inventory.md) | [`query_inventory`](../tools/tools/query_inventory.md), [`apply_inventory`](../tools/tools/apply_inventory.md), [`upload_bills`](../tools/tools/upload_bills.md) |
| **Business Agent** | `business` | Dashboard → Business | [business.md](./business.md) | [`query_business`](../tools/tools/query_business.md), [`apply_business`](../tools/tools/apply_business.md) |
| **Creative Agent** | `create` | Dashboard → Create | [creative.md](./creative.md) | [`query_menu`](../tools/tools/query_menu.md), [`apply_menu`](../tools/tools/apply_menu.md) |

**No fifth chat agent.** New capabilities = new **actions** inside these tools, not new personas.

Tool index: [tools/Tool_Index.md](../tools/Tool_Index.md)

---

## Background workers

Python FastAPI at `backend/agent-service/` (`npm run start:agents`). Invoked by tools and UI — not conversational agents.

| Worker | Doc | Endpoint |
|--------|-----|----------|
| Purchase / sales bill parser | [purchase-order-parser.md](./purchase-order-parser.md) | `POST /parse-bill-pipeline` |
| Item normalizer | [item-normalizer.md](./item-normalizer.md) | Inside parse pipeline |
| Image suggestions | [image-suggestions.md](./image-suggestions.md) | `POST /suggest-images` |
| Recipe linker | — | `POST /link-recipe` |
| Catalog batch prep | — | `POST /prepare-catalog-batch` |
| Chat orchestration | [../tools/Development.md](../tools/Development.md) | `POST /chat` |

Bill **Process** (confirm, update stock) runs in Next.js — wrapped by `apply_inventory` / `apply_business` via `pending_action`.

---

## Architecture

```
Chef → Sous Chef (query_kitchen + orchestrate)
         ├─ Inventory  query_inventory · apply_inventory · upload_bills
         ├─ Business   query_business · apply_business
         └─ Creative   query_menu · apply_menu
                    ↓
              Workers (parse, images, link-recipe)
                    ↓
              MongoDB + storage/r2
```
