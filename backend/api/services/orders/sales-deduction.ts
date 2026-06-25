import type { IIngredientLink } from "@backend/models/Dish";
import { Ingredient } from "@backend/models/Ingredient";

export function usageToInventoryQty(
  ingredient: {
    inventoryUnit: string;
    usageUnits?: Array<{ unit: string; countPerInventoryUnit: number }>;
  },
  usageQty: number,
  usageUnit: string
): number {
  const conversion = ingredient.usageUnits?.find((u) => u.unit === usageUnit);
  if (!conversion) {
    if (usageUnit === ingredient.inventoryUnit) return usageQty;
    return 0;
  }
  return usageQty / conversion.countPerInventoryUnit;
}

/** Deduct pantry stock for one menu line using its recipe links × qty sold. */
export async function deductRecipeIngredients(
  restaurantId: string,
  links: IIngredientLink[],
  servings: number
): Promise<number> {
  if (!links.length || servings <= 0) return 0;

  let linesDeducted = 0;
  for (const link of links) {
    const ing = await Ingredient.findOne({ restaurantId, slug: link.ingredientSlug });
    if (!ing) continue;

    const usageQty = link.qtyPerServing * servings;
    const deduct = usageToInventoryQty(ing, usageQty, link.unit);
    if (deduct <= 0) continue;

    ing.currentQty = Math.max(0, ing.currentQty - deduct);
    await ing.save();
    linesDeducted += 1;
  }
  return linesDeducted;
}
