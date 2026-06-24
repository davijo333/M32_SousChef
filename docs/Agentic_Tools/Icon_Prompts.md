# Agent & App Icon Prompts

Image-generation prompts for Sous Chef branding. Icons live in `apps/web/public/brand/`.

## Brand palette

| Token | Hex | Use |
|-------|-----|-----|
| Sage | `#4a6b52` | Primary, Sous Chef, Inventory |
| Sage light | `#e8f0ea` | Backgrounds |
| Cream | `#faf8f5` | App background |
| Amber | `#b87a3d` | Business accent |
| Text | `#2a2622` | Lines / details |

## Shared specs

Append to every prompt:

> Square 1:1, 1024×1024, flat vector app-icon style, minimal detail, readable at 48px, no text, no watermark, cream or transparent background, warm professional café aesthetic, consistent line weight across the set.

**Negative prompt:** no photorealism, no 3D render, no anime, no cluttered background, no words, no meme style.

## Files

| File | Folder |
|------|--------|
| `icon.png` | `brand/app-logo/` — App logo |
| `icon.png` | `brand/head-chef/` — Sous Chef |
| `icon.png` | `brand/inventory-agent/` — Inventory Assistant |
| `icon.png` | `brand/business-agent/` — Business Assistant |
| `icon.png` | `brand/creative-agent/` — Creative Assistant |

## Prompts

### 1. Sous Chef (app)

App icon for "Sous Chef", an AI kitchen management product for cafés and restaurants. A friendly stylized chef's toque merged with a subtle digital spark or small circuit leaf motif — human kitchen meets smart assistant. Primary color sage green (#4a6b52) on warm cream (#faf8f5). Clean flat vector, rounded shapes, soft shadow, modern SaaS icon. Trustworthy and professional. Square, centered, no letters.

### 2. Sous Chef

Chat avatar for "Sous Chef", lead AI orchestrator. Confident head chef: tall toque, simple silhouette, conductor gesture. Sage green (#4a6b52) and white, small amber (#b87a3d) hat band. Flat vector, circular crop friendly, authoritative but approachable. No text.

### 3. Inventory Assistant

Chat avatar for pantry/stock AI. Wire pantry shelf or labeled jar with clipboard/checkmark. Sage (#4a6b52) and mint (#e8f0ea) on cream. Flat vector, meticulous mood. Circular avatar, no text.

### 4. Business Assistant

Chat avatar for finance/sales AI. Simple bar chart or receipt with margin arrow. Amber (#b87a3d) and cream with sage accent. Flat vector, professional analyst tone. Circular avatar, no numbers or text.

### 5. Creative Assistant

Chat avatar for menu ideation AI. Lightbulb or plate with leaf and steam swirl. Soft emerald and amber on cream. Flat vector, inventive but minimal. Circular avatar, no text.

## Usage in app

```ts
import { AGENT_ICONS } from "@/lib/agent-icons";

<img src={AGENT_ICONS.headChef} alt="Sous Chef" className="h-8 w-8" />
```

Regenerate: use prompts above in DALL·E / Midjourney; replace `icon.png` in the matching `public/brand/*` folder.
