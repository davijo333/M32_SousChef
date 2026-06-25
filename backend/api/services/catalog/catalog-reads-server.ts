import { Recipe } from "@backend/models/Recipe";
import {
  findAddOnByNameQuery,
  findIngredientByNameQuery,
} from "@backend/services/catalog/catalog-lookup";
import { findDishByNameQuery } from "@backend/services/catalog/dish-lookup";
import { suggestDishPriceMargin } from "@backend/services/agents/agent-menu-actions";
import { connectDB } from "@backend/services/infra/mongodb";

export type CatalogLookupKind = "dish" | "addon" | "ingredient";

export async function formatIngredientDetailFromDb(
  restaurantId: string,
  nameQuery: string
): Promise<string | null> {
  const ing = await findIngredientByNameQuery(restaurantId, nameQuery);
  if (!ing) return null;
  const low = ing.currentQty <= ing.reorderThreshold;
  return [
    `**${ing.name}** (\`${ing.slug}\`)`,
    `- **On hand:** ${ing.currentQty} ${ing.inventoryUnit}`,
    `- **Reorder level:** ${ing.reorderThreshold} ${ing.inventoryUnit}`,
    `- Category: ${ing.category}`,
    ...(low ? ["- ⚠ At or below reorder level."] : []),
  ].join("\n");
}

export async function formatAddOnDetailFromDb(
  restaurantId: string,
  nameQuery: string
): Promise<string | null> {
  const addOn = await findAddOnByNameQuery(restaurantId, nameQuery);
  if (!addOn) return null;

  await connectDB();
  const recipe = await Recipe.findOne({
    restaurantId,
    kind: "addon",
    targetSlug: addOn.slug,
  })
    .select("foodCost")
    .lean();

  const sell = addOn.sellPrice;
  const cost = Number(recipe?.foodCost ?? 0);
  const lines = [
    `**${addOn.name}** (\`${addOn.slug}\`) — Add-on`,
    `- **Sell price (menu):** $${sell.toFixed(2)}`,
  ];
  if (cost > 0) {
    const margin = sell - cost;
    const pct = sell > 0 ? (margin / sell) * 100 : 0;
    lines.push(`- **Food cost:** $${cost.toFixed(2)}`);
    lines.push(`- **Margin:** $${margin.toFixed(2)} (${pct.toFixed(0)}%)`);
  } else if (sell > 0) {
    lines.push("- Food cost: still calculating (link recipe ingredients).");
  }
  return lines.join("\n");
}

export async function replyCatalogLookupFromDb(
  restaurantId: string,
  kind: CatalogLookupKind,
  nameQuery: string
): Promise<string | null> {
  if (kind === "ingredient") {
    return formatIngredientDetailFromDb(restaurantId, nameQuery);
  }
  if (kind === "addon") {
    return formatAddOnDetailFromDb(restaurantId, nameQuery);
  }
  return suggestDishPriceMargin(restaurantId, nameQuery);
}
