# Image suggestions (2a)

**File:** `services/agent/image_suggestions.py`  
**Endpoint:** `POST /suggest-images`

Fetches **two static product-packaging photos** per ingredient (no GIFs).

## Search strategy

Queries are built like Google Shopping searches:

- `{brand}, {product name}`
- `{brand} {product} grocery product packaging photo`
- Pack size from line text (dozen, lb, oz, …)

Up to **6 queries** are tried until enough candidates are found.

## Quality filters

| Filter | Rejects |
|--------|---------|
| URL | `.gif`, Giphy, Tenor, memes, SVG icons |
| Label | police, chart, diagram, cartoon, meme, unrelated terms |
| Relevance | Labels with no overlap to product name or brand |

When `OPENAI_API_KEY` is set, **GPT-4o-mini** scores labels and picks the best matches.

## Regenerate (Kitchen modal)

Manual only — opening the modal does **not** trigger generation.

`POST /api/catalog/ingredients/[slug]/generate-images`

| `mode` | When to use | Behavior |
|--------|-------------|----------|
| `pair` | Fewer than 2 images | Fetch default + secondary (keeps existing default if one is already set) |
| `secondary` | Both slots filled | Replace **non-default** image only (`selectedImageIndex` in body picks which slot is default) |

Pass `selectedImageIndex` from the modal so regeneration replaces whichever slot is currently secondary, even before Save.

Initial images come from the agent during **purchase order Process** (2 photos, first = default). `imageGenerationAttempted` is set on Process; Pantry lists the item after that attempt.

## Normalizer integration

`item_normalizer.normalize_with_images` calls `suggest_images` with `use_gpt=True` when the OpenAI client is available.
