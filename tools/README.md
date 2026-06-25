# Agentic Tools

LangChain / LangGraph chat: **9 core tools**, **4 agents**, dual manual + chat paths.

| Doc | Purpose |
|-----|---------|
| **[Tool_Index.md](./Tool_Index.md)** | All tools, which agent uses each, **Built?** (9 Yes) |
| **[tools/](./tools/)** | One file per core tool + `manifest.json` |
| [Development.md](./Development.md) | Run locally, deploy, supervisor graph, core tool layout |
| [User_Flows.md](./User_Flows.md) | Chat UI and handoff flows |

**Agents:** [agents/](../agents/README.md)

---

## Core tools

| Agent | Read | Write / orchestrate | Upload |
|-------|------|---------------------|--------|
| **Sous Chef** | `query_kitchen` | `orchestrate` | — |
| **Inventory** | `query_inventory` | `apply_inventory` | **`upload_bills`** |
| **Business** | `query_business` | `apply_business` | — |
| **Creative** | `query_menu` | `apply_menu` | — |

**Runtime code:** `backend/agent-service/tools/core/` (LangChain `@tool` definitions)

**Write execution (Next.js):** `backend/api/services/agents/agent-pending-actions.ts`, `agent-menu-actions.ts`, `backend/api/services/creative/create-suggestion.ts`

Edit [tools/manifest.json](./tools/manifest.json), then:

```bash
npm run generate:tool-docs
```

---

## Dual path

**Manual** (Upload orders, Kitchen control, Recipes) always works. **Chat** uses the same outcomes via core tools — confirm writes return `pending_action` / `suggestion_action` for Next.js to execute.
