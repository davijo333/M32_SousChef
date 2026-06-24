# Kitchen Control

Human-in-the-loop control layer. Fix parser mistakes, dish ↔ ingredient mapping, quantities, expiry, and per-dish weights in one place.

## Purpose

Correct and refine data after bill ingest and agent suggestions. Edits set `manual_override: true` so future bill uploads do not clobber user changes.

## Route

`/kitchen-control`

## Layout (MVP scaffold)

Split view — same screen for **links** and **overrides**:

```
┌──────────────────────────────────────────────────────────┐
│  Kitchen Control                                         │
├──────────────────────────┬───────────────────────────────┤
│  Dishes (left)           │  Ingredients (right)          │
│  • Bacon Egg & Cheese    │  • Eggs (each)                │
│  • Avocado Toast         │  • Bacon (slice)              │
│  • Iced Vanilla Latte    │  • Milk (oz)                  │
└──────────────────────────┴───────────────────────────────┘
```

## Sections (full build)

### 1. Ingredient links

Map dishes ↔ ingredients with qty per serving. Populated by Linker / Recipe Research agents; user corrects when wrong.

- Table: dish name, linked count, confidence, complete / incomplete
- Filter: unlinked dishes, unlinked ingredients
- Per-dish editor: qty/serving, unit, add/remove ingredient
- *Suggest ingredients* runs Recipe Researcher agent

### 2. Raw materials (ingredients)

- Edit `current_qty`, unit, expiry, reorder threshold
- Add manually, merge duplicates
- `manual_override: true` on user-edited fields

### 3. Dishes

- Edit name, sell price, category
- Override qty per serving per ingredient

### 4. Manual add (failsafe)

| Action | When |
|--------|------|
| Add ingredient manually | Never on a bill |
| Add dish manually | New menu item |
| Merge duplicates | Parser split one item |
| Reclassify on bill review | Wrong bucket |

## Source flags

```ts
source: "bill_upload" | "manual" | "agent_suggested" | "seed"
manual_override: boolean
```

## Related pages

- [Upload Bills](./upload-bills.md)
- [Dashboard](./dashboard.md)
- **2a Recipe Researcher** / **2b Linker** → [agents](../agents/README.md)
