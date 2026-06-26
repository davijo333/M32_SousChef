# DEPRECATED: superseded by backend/agent-service-v1. Entire file commented out.
# """Shared models for recipe researcher and inventory manager (linker)."""
#
# from __future__ import annotations
#
# from pydantic import BaseModel, Field
#
#
# class IngredientCatalogItem(BaseModel):
#     slug: str
#     name: str
#     inventoryUnit: str = "each"
#     usageUnits: list[dict] = Field(default_factory=list)
#
#
# class MenuItemInput(BaseModel):
#     slug: str
#     name: str
#     type: str = "standard"
#     category: str = "other"
#     description: str = ""
#
#
# class SuggestedLink(BaseModel):
#     ingredientSlug: str
#     qtyPerServing: float
#     unit: str
#     scalesWithSize: bool = True
#     confidence: float = Field(ge=0, le=1, default=0.7)
#     notes: str = ""
#
#
# class LinkRecipeResult(BaseModel):
#     menuItemSlug: str
#     links: list[SuggestedLink]
#     warnings: list[str] = Field(default_factory=list)
#     missingIngredientSlugs: list[str] = Field(default_factory=list)
