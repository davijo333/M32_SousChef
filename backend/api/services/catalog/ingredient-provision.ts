import { executeInventoryPendingAction } from "@backend/services/agents/agent-inventory-actions";
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
  const key = token.trim();
  if (!key) throw new Error("Empty ingredient reference");

  if (key.startsWith("ing-")) {
    const bySlug = await Ingredient.findOne({ restaurantId, slug: key });
    if (bySlug) return bySlug.slug;
  }

  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let ing = await Ingredient.findOne({
    restaurantId,
    name: new RegExp(`^${escaped}$`, "i"),
  });
  if (ing) return ing.slug;

  const slug = ingredientSlugFromName(key);
  ing = await Ingredient.findOne({ restaurantId, slug });
  if (ing) return ing.slug;

  await executeInventoryPendingAction(restaurantId, {
    kind: "create_ingredient",
    ingredientName: key,
    label: "new",
    inventoryUnit: options?.inventoryUnit ?? "each",
    currentQty: 0,
    category: options?.category ?? "misc",
  });

  ing =
    (await Ingredient.findOne({ restaurantId, slug })) ??
    (await Ingredient.findOne({
      restaurantId,
      name: new RegExp(`^${escaped}$`, "i"),
    }));
  if (!ing) throw new Error(`Could not create pantry item **${key}**.`);
  return ing.slug;
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
