# Dashboard

Home screen after login. Operational snapshot plus embedded Sous Chef chat at the bottom center — no separate chat tab.

## Purpose

Give café owners an at-a-glance view of inventory health and next actions, with chat always available for questions about stock, menu, and reorders.

## Route

`/dashboard`

## Layout

```
┌──────────────────────────────────────────────────────────┐
│  Sous Chef    Dashboard · Upload Bills · Kitchen Control │
│              · Recipes · Promotions              Logout  │
├──────────────────────────────────────────────────────────┤
│  Good morning, Chef Maria                                │
│  Sunrise Diner                                           │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │Ingredients│ │Menu items│ │ Expiring │ │Low stock │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│                                                          │
│  Expiring in 48 hours          Low stock                 │
│  • Spinach  2 lb               • Bacon  1.2 lb           │
│                                                          │
├──────────────────────────────────────────────────────────┤
│              ┌─────────────────────────────┐           │
│              │  Sous Chef chat (expanded)    │           │
│              │  You: How much bacon left?    │           │
│              │  Sous Chef: Bacon: 48 slices…│           │
│              │  [ Ask about inventory… ] Send│           │
│              └─────────────────────────────┘           │
└──────────────────────────────────────────────────────────┘
```

## Embedded chat (no separate page)

- Fixed **bottom-center** chat panel on dashboard
- Collapsed: large input + Send
- Expanded: message history + Minimize (after first message or focus)
- Calls `/api/chat` with session persistence (`conversationId`)
- `/chat` redirects to `/dashboard`

### Session context (required)

- Messages stored per `conversationId` in MongoDB
- In-thread memory: *"My name is David"* → *"What is my name?"* → *"David"*

## Empty state (cold start)

- Primary CTA: **Load Sunrise Diner demo** or **Upload bills**
- Copy: *Upload a supplier bill — or load the demo, then ask Sous Chef below.*

## Widgets (MVP → stretch)

### Must have
- Onboarding banner when no ingredients
- Count cards: ingredients, menu items, expiring, low stock
- Expiring / low stock lists

### Should have (Day 2)
- Recent bills
- Unlinked items queue → Kitchen Control
- Morning briefing (stretch)

## Actions

| Action | Destination |
|--------|-------------|
| Upload bills | `/upload-bills` |
| Kitchen Control | `/kitchen-control` |
| Recipes | `/recipes` |
| Promotions | `/promotions` |

## Related pages

- [Upload Bills](./upload-bills.md)
- [Kitchen Control](./kitchen-control.md)
- Agents → [agents/README.md](../agents/README.md)
