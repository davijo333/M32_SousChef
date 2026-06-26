import { executeInventoryPendingAction } from "@backend/services/agents/agent-inventory-actions";
import {
  basicPantryName,
  buildIngredientSku,
  findExistingIngredient,
} from "@backend/services/catalog/ingredient-identity";
import { Ingredient } from "@backend/models/Ingredient";

export function ingredientSlugFromName(name: string): string {
  return `ing-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

/** Resolve slug or create pantry row at qty 0 when missing (chat add-ons / dish links). */
export async function ensureIngredientSlug(
  restaurantId: string,
  token: string,
  options?: { inventoryUnit?: string; category?: string }
): Promise<string> {
  const key = basicPantryName(token.trim());
  if (!key) throw new Error("Empty ingredient reference");

  if (key.startsWith("ing-")) {
    const bySlug = await Ingredient.findOne({ restaurantId, slug: key });
    if (bySlug) return bySlug.slug;
  }

  const inventoryUnit = options?.inventoryUnit ?? "each";
  const identity = {
    name: key,
    inventoryUnit,
    rawName: token.trim(),
    sku: buildIngredientSku({ name: key, inventoryUnit, rawName: token.trim() }),
  };

  const linked = await findExistingIngredient(restaurantId, identity);
  if (linked) return linked.slug;

  try {
    await executeInventoryPendingAction(restaurantId, {
      kind: "create_ingredient",
      ingredientName: key,
      label: "new",
      inventoryUnit,
      currentQty: 0,
      category: options?.category ?? "misc",
    });
  } catch (err) {
    const afterError = await findExistingIngredient(restaurantId, identity);
    if (afterError) return afterError.slug;
    throw err;
  }

  const created = await findExistingIngredient(restaurantId, identity);
  if (created) return created.slug;

  const slug = ingredientSlugFromName(key);
  const bySlug = await Ingredient.findOne({ restaurantId, slug });
  if (bySlug) return bySlug.slug;

  throw new Error(`Could not create pantry item **${key}**.`);
}

export async function ensureIngredientSlugs(
  restaurantId: string,
  tokens: string[]
): Promise<string[]> {
  const slugs: string[] = [];
  for (const token of tokens) {
    slugs.push(await ensureIngredientSlug(restaurantId, token));
  }
  return slugs;
}
