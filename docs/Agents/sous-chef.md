# Sous Chef

| Field | Value |
|-------|-------|
| **Context key** | `head` |
| **Icon** | `head_chef` |
| **Dashboard** | Floating chat dock (supervisor) |
| **Persona** | Executive chef — routes the line, speaks plainly to the owner |

## Role

Supervisor. Classifies intent, answers from high-level snapshots when possible, **consults** specialists for live data, **synthesizes** cross-domain answers, and **hands off** when the chef needs depth in one domain.

Does **not** invent figures. Does **not** upload bills or save dishes — delegates to specialists.

## Core tools

| Tier | Tool | Built? |
|------|------|--------|
| Read | [`query_kitchen`](../Agentic_Tools/tools/query_kitchen.md) | Yes |
| Orchestrate | [`orchestrate`](../Agentic_Tools/tools/orchestrate.md) | Yes |

Sous Chef does **not** use `upload_bills`, `apply_inventory`, `apply_business`, or `apply_menu` directly.

## Consultation flow

```
What's low stock and our best margin dish?
→ query_kitchen / classify
→ consult Inventory + Business (via supervisor graph)
→ orchestrate (synthesize one reply)
```

## Handoff flow

When depth is needed in one domain, Sous Chef suggests a specialist → chef taps **Connect to … Agent** → Inventory, Business, or Creative takes over until **Connect back to Sous Chef**.

## Implementation

| Piece | Code |
|-------|------|
| Supervisor graph | `services/agent/agents/supervisor.py` |
| Core tools | `services/agent/tools/core/factory.py` |
| Handoff UI | `apps/web/src/lib/chat-handoff.ts`, `SousChefChatDock.tsx` |
| Chat API | `apps/web/src/app/api/dashboard/chat/route.ts` |

## See also

- [Tool Index](../Agentic_Tools/Tool_Index.md)
- [User flows](../Agentic_Tools/User_Flows.md)
- [Inventory](./inventory.md) · [Business](./business.md) · [Creative](./creative.md)
