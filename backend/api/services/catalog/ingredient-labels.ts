import type { IngredientLabel } from "@backend/models/Ingredient";
import { AddOn } from "@backend/models/AddOn";
import { Dish } from "@backend/models/Dish";
import { Ingredient } from "@backend/models/Ingredient";

/** Collect all ingredient slugs referenced in dish and add-on recipes. */
export async function collectUsedIngredientSlugs(restaurantId: string): Promise<Set<string>> {
  const [dishes, addOns] = await Promise.all([
    Dish.find({ restaurantId }).select("ingredientLinks").lean(),
    AddOn.find({ restaurantId }).select("ingredientLinks").lean(),
  ]);

  const used = new Set<string>();
  for (const item of [...dishes, ...addOns]) {
    for (const link of item.ingredientLinks ?? []) {
      if (link.ingredientSlug) used.add(link.ingredientSlug);
    }
  }
  return used;
}

/** Recompute pantry labels after recipe linking. */
export async function refreshIngredientLabels(
  restaurantId: string,
  missingSlugs: string[] = []
): Promise<{ used: number; unused: number; missing: number }> {
  const usedSlugs = await collectUsedIngredientSlugs(restaurantId);
  const missingSet = new Set(missingSlugs.filter(Boolean));

  const ingredients = await Ingredient.find({ restaurantId }).select("slug label").lean();
  let used = 0;
  let unused = 0;
  let missing = 0;

  for (const ing of ingredients) {
    let label: IngredientLabel | undefined;
    if (usedSlugs.has(ing.slug)) {
      label = "used";
      used += 1;
    } else if (missingSet.has(ing.slug)) {
      label = "missing";
      missing += 1;
    } else {
      label = "unused";
      unused += 1;
    }
    await Ingredient.updateOne({ _id: ing._id }, { $set: { label } });
  }

  return { used, unused, missing };
}
