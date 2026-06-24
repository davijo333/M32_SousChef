# Sous Chef — Tools & Orchestration

**Role:** Supervisor. Routes intent, consults specialists, hands off to user, synthesizes answers. Does not invent inventory or sales figures — uses consult tools or specialist results.

**Persona:** Executive chef — coordinates the line, speaks plainly to the owner.

---

## Orchestration tools (Sous Chef only)

| Tool | Args | Returns | When to use |
|------|------|---------|-------------|
| `classify_intent` | `message` | `{ domains, mode }` | First hop (graph node or tool) |
| `consult_inventory` | `question`, `context?` | Answer + `toolTrace` | Stock/expiry without handoff |
| `consult_business` | `question`, `financeView?` | Answer + `toolTrace` | Margins, sales, purchases |
| `consult_creative` | `question`, `includeCues?` | Answer + `toolTrace` | Menu ideas (no save unless confirmed) |
| `consult_multi` | `steps: [{ agent, question }]` | Array of results | Cross-domain in one turn |
| `handoff_to_inventory` | `reason` | `{ activeAgent: "inventory" }` | User talks directly to Inventory |
| `handoff_to_business` | `reason` | `{ activeAgent: "business" }` | User talks directly to Business |
| `handoff_to_creative` | `reason` | `{ activeAgent: "creative" }` | User talks directly to Creative |
| `return_to_head_chef` | `summary?` | `{ activeAgent: "head_chef" }` | After handoff |
| `synthesize_response` | `consultResults`, `userMessage` | Final markdown | After consult(s) |

**UI:** `handoff_*` syncs the 4-agent tab bar. Emits `delegation` transcript event.

---

## Upload orchestration (Sous Chef only)

| Tool | Args | Effect |
|------|------|--------|
| `validate_upload_batch` | `fileCount` | Reject if > 10 |
| `classify_bill_document` | per file | `supplier` \| `customer` \| `ambiguous` |
| `handoff_purchase_bills` | `files[]` | Parse as `supplier` → Upload orders Purchase tab |
| `handoff_sales_bills` | `files[]` | Parse as `customer` → Upload orders Sales tab |
| `summarize_upload_handoff` | `billIds[]` | Delegation message text (no file blobs in chat) |

**Handoff rule:** After success, clear composer; files only on Upload orders; thread = text + link.

Wraps: `POST /api/bills/parse` with `billType=supplier|customer`.

---

## Read tools (light — prefer consult_*)

| Tool | Args | Wraps |
|------|------|-------|
| `get_kitchen_summary` | — | `/api/dashboard` high-level counts |
| `get_active_agent_context` | — | `selectedAgent`, `activeAgent` |

---

## Bridge tools

| Tool | Args | Effect |
|------|------|--------|
| `navigate_to` | `page`, `section?`, `tab?` | Client router: dashboard, upload-orders, kitchen-control, recipes |
| `open_chat_agent` | `agent` | Set floating dock tab |
| `get_pending_bill_uploads` | `billType?` | Bills awaiting review |
| `describe_upload_flow` | — | Purchase before sales; max 10 files |

---

## Worker tools

| Tool | Args | Wraps | Confirm? |
|------|------|-------|----------|
| `get_recipe_agent_status` | — | `recipe-agent-status.ts` | No |
| `trigger_recipe_pipeline` | — | `runRecipePipeline` | Yes |
| `get_bill_parse_status` | `billId` | `BillUpload` | No |

---

## Sous Chef does NOT get

- `add_suggested_dish` — Creative saves; Sous Chef consults or handoffs
- `update_reorder_threshold` — Inventory
- `process_purchase_bills` / `process_sales_bills` — specialists (or Upload orders UI)

---

## Example flows

### Consultation

```
User: What's low stock and what's our best margin dish?
→ consult_inventory("low stock and expiry")
→ consult_business("top margin dishes this month")
→ synthesize_response
```

### Upload handoff

```
User: [3 files]
→ classify_bill_document × 3
→ handoff_purchase_bills (2)
→ handoff_sales_bills (1)
→ summarize_upload_handoff
→ navigate_to(upload-orders) [optional]
```

### Chain + save

```
User: Use expiring spinach in a special and save it
→ consult_inventory → consult_creative → (confirm) add via Creative consult
→ synthesize_response
```

---

## MVP tools (Sous Chef)

1. `consult_inventory`, `consult_business`, `consult_creative`
2. `handoff_to_*` (×3), `return_to_head_chef`
3. `classify_bill_document`, `handoff_purchase_bills`, `handoff_sales_bills`
4. `get_kitchen_summary`, `navigate_to`
