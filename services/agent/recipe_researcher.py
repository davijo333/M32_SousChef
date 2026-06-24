"""Recipe Researcher — propose ingredients per dish (pantry-aware)."""

from __future__ import annotations

import json

from openai import OpenAI
from pydantic import BaseModel, Field

from recipe_models import IngredientCatalogItem, MenuItemInput, SuggestedLink


class RecipeResearchResult(BaseModel):
    menu_item_slug: str
    proposed_links: list[SuggestedLink] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    missing_ingredient_slugs: list[str] = Field(default_factory=list)


def _heuristic_research(
    menu_item: MenuItemInput, ingredients: list[IngredientCatalogItem]
) -> list[SuggestedLink]:
    name_lower = menu_item.name.lower()
    links: list[SuggestedLink] = []
    for ing in ingredients:
        token = ing.name.lower().split()[0]
        if len(token) < 4:
            continue
        if token in name_lower:
            unit = ing.usageUnits[0]["unit"] if ing.usageUnits else ing.inventoryUnit
            links.append(
                SuggestedLink(
                    ingredientSlug=ing.slug,
                    qtyPerServing=1,
                    unit=unit,
                    confidence=0.55,
                    notes="name match",
                )
            )
    return links[:6]


def research_recipe(
    client: OpenAI | None,
    menu_item: MenuItemInput,
    ingredients: list[IngredientCatalogItem],
) -> RecipeResearchResult:
    """Suggest ingredient usage for one menu item."""
    if ingredients:
        heuristic = _heuristic_research(menu_item, ingredients)
        if heuristic:
            return RecipeResearchResult(
                menu_item_slug=menu_item.slug,
                proposed_links=heuristic,
            )

    if not client:
        return RecipeResearchResult(
            menu_item_slug=menu_item.slug,
            warnings=["No API key — could not research recipe"],
        )

    catalog = [
        {
            "slug": i.slug,
            "name": i.name,
            "units": [u.get("unit", i.inventoryUnit) for u in (i.usageUnits or [])]
            or [i.inventoryUnit],
        }
        for i in ingredients
    ]
    pantry_note = (
        "Use only slugs from the pantry list."
        if catalog
        else "Propose typical breakfast-diner ingredients with slug guesses like ing-egg, ing-bread."
    )

    prompt = f"""You are a breakfast-diner recipe researcher. Propose ingredients for one menu item.

Menu item:
{json.dumps(menu_item.model_dump(), indent=2)}

Pantry:
{json.dumps(catalog, indent=2)}

Return JSON:
{{
  "links": [
    {{
      "ingredientSlug": "ing-...",
      "qtyPerServing": 1,
      "unit": "each|oz|slice|cup|...",
      "scalesWithSize": true,
      "confidence": 0.0,
      "notes": ""
    }}
  ],
  "missingIngredientSlugs": ["ing-..."],
  "warnings": []
}}

Rules:
- {pantry_note}
- missingIngredientSlugs: slugs needed but NOT in pantry.
- Coffee/tea/juice pourables: scalesWithSize true.
- Return fewer links with warnings if unsure."""

    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )
    raw = completion.choices[0].message.content or "{}"
    data = json.loads(raw)
    links = [SuggestedLink.model_validate(row) for row in data.get("links", [])]
    warnings = list(data.get("warnings", []))
    missing = list(data.get("missingIngredientSlugs", []))

    if ingredients:
        valid = {i.slug for i in ingredients}
        filtered: list[SuggestedLink] = []
        for link in links:
            if link.ingredientSlug not in valid:
                missing.append(link.ingredientSlug)
                warnings.append(f"Skipped unknown ingredient {link.ingredientSlug}")
                continue
            filtered.append(link)
        links = filtered

    return RecipeResearchResult(
        menu_item_slug=menu_item.slug,
        proposed_links=links,
        warnings=warnings,
        missing_ingredient_slugs=missing,
    )
