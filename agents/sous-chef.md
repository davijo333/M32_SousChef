# Sous Chef

| Field | Value |
|-------|-------|
| **Context key** | `head` |
| **Icon** | `head_chef` |
| **Dashboard** | Floating chat dock (supervisor) |
| **Persona** | Kitchen supervisor — routes workflows, confirms before writes |
| **Spec** | `backend/agent-service/agents/head/` |

## Role

Supervisor. Runs **golden workflows** (`golden-workflows.yaml`): triage, confirmation gates, **sequential** specialist consults, synthesis of tool output.

Does **not** invent figures or claim writes completed.

## Delegation

| Need | Specialist |
|------|------------|
| Recipes, specials, **suggested add-ons for dishes** | **Creator Agent** |
| All catalog & bill writes | **Inventory Agent** |
| Sales, margins, reorder advice | **Business Agent** |

**Add dish:** Creative drafts recipe + **visual brief** + suggested add-ons → chef confirms → Inventory plan/finalize (auto images; no photo picking in chat).

## Core tools

| Tier | Tool | Built? |
|------|------|--------|
| Read | `query_kitchen` | Yes |
| Orchestrate | `orchestrate` | Yes |

Sous Chef does **not** use `apply_inventory`, `apply_menu`, or `upload_bills` writes.

## Golden workflows (summary)

See `agents/head/golden-workflows.yaml` for full step lists.

- `add_dish_from_chat` — Creative recipe + add-ons → Inventory persist
- `suggest_dish_addons` — Creative only → Inventory on confirm
- `add_addon_from_chat`, `add_ingredient_from_chat`
- `upload_purchase_orders`, `upload_sales_orders`
- `add_suggested_dish_lite`, `margin_and_price_pass`, bill processing

## Implementation

| Piece | Code |
|-------|------|
| Supervisor graph | `agents/head/graph.py` |
| Workflow routing | `agents/head/orchestration.py` |
| Routing cards | `agents/head/cards.yaml` |

## See also

- [Tool Index](../tools/Tool_Index.md)
- [Inventory](./inventory.md) · [Business](./business.md) · [Creative](./creative.md)
