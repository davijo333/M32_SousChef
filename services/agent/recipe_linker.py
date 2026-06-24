"""Inventory Manager Agent — links dishes/add-ons to pantry ingredients."""

from __future__ import annotations

from openai import OpenAI

from recipe_models import (
    IngredientCatalogItem,
    LinkRecipeResult,
    MenuItemInput,
    SuggestedLink,
)
from recipe_researcher import research_recipe


def _rule_links(menu_item: MenuItemInput, ingredients: list[IngredientCatalogItem]) -> list[SuggestedLink]:
    if not menu_item.slug.startswith("addon-"):
        return []

    suffix = menu_item.slug.replace("addon-", "", 1)
    by_slug = {i.slug: i for i in ingredients}
    candidates = [f"ing-{suffix}"]
    if suffix == "cheese":
        candidates = ["ing-cheddar", "ing-swiss", "ing-american"]
    elif suffix == "veggies":
        candidates = ["ing-spinach", "ing-tomato", "ing-bell-pepper"]
    elif suffix == "whipped-cream":
        candidates = ["ing-heavy-cream"]

    for slug in candidates:
        if slug in by_slug:
            ing = by_slug[slug]
            unit = ing.usageUnits[0]["unit"] if ing.usageUnits else ing.inventoryUnit
            return [
                SuggestedLink(
                    ingredientSlug=slug,
                    qtyPerServing=1 if suffix != "veggies" else 0.25,
                    unit=unit,
                    scalesWithSize=False,
                    confidence=0.95,
                    notes="addon rule",
                )
            ]
    return []


def _name_heuristic_links(
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


def link_recipe(
    client: OpenAI | None,
    menu_item: MenuItemInput,
    ingredients: list[IngredientCatalogItem],
) -> LinkRecipeResult:
    """IM-Agent: map a dish or add-on to pantry ingredients."""
    ruled = _rule_links(menu_item, ingredients)
    if ruled:
        return LinkRecipeResult(menuItemSlug=menu_item.slug, links=ruled)

    if menu_item.type == "addon":
        heuristic = _name_heuristic_links(menu_item, ingredients)
        if heuristic:
            return LinkRecipeResult(menuItemSlug=menu_item.slug, links=heuristic)
        return LinkRecipeResult(
            menuItemSlug=menu_item.slug,
            links=[],
            warnings=["Could not map addon to an ingredient automatically"],
        )

    heuristic = _name_heuristic_links(menu_item, ingredients)
    if heuristic:
        return LinkRecipeResult(menuItemSlug=menu_item.slug, links=heuristic)

    researched = research_recipe(client, menu_item, ingredients)
    return LinkRecipeResult(
        menuItemSlug=menu_item.slug,
        links=researched.proposed_links,
        warnings=researched.warnings,
        missingIngredientSlugs=researched.missing_ingredient_slugs,
    )
