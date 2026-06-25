import {
  findIngredientByNameQuery,
  searchIngredientsByNameQuery,
} from "@backend/services/catalog/catalog-lookup";
import type { ReorderThresholdRequest } from "@backend/services/chat/chat-reorder-adjustment";

export type ResolvedReorderThreshold = {
  slug: string;
  name: string;
  reorderThreshold: number;
  currentThreshold: number;
  inventoryUnit: string;
};

export async function resolveReorderThresholdForAdjustment(
  restaurantId: string,
  ingredientName: string,
  request: ReorderThresholdRequest
): Promise<ResolvedReorderThreshold | null> {
  let ing = await findIngredientByNameQuery(restaurantId, ingredientName || request.ingredientName);
  if (!ing) {
    const suggestions = await searchIngredientsByNameQuery(
      restaurantId,
      ingredientName || request.ingredientName,
      3
    );
    if (suggestions.length === 1) {
      ing = suggestions[0];
    }
  }
  if (!ing) return null;

  return {
    slug: ing.slug,
    name: ing.name,
    reorderThreshold: request.reorderThreshold,
    currentThreshold: ing.reorderThreshold,
    inventoryUnit: ing.inventoryUnit,
  };
}
