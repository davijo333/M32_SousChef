import { scoreMatch } from "@/lib/bill-normalizer";
import type { IngredientIdentityInput } from "@/lib/ingredient-sku";
import { Ingredient } from "@/models/Ingredient";
import type { HydratedDocument } from "mongoose";
import type { IIngredient } from "@/models/Ingredient";

export type { IngredientIdentityInput } from "@/lib/ingredient-sku";
export { buildIngredientSku, extractVolumeFromName } from "@/lib/ingredient-sku";

export async function findExistingIngredient(
  restaurantId: string,
  input: IngredientIdentityInput & { sku: string }
): Promise<HydratedDocument<IIngredient> | null> {
  const bySku = await Ingredient.findOne({ restaurantId, sku: input.sku });
  if (bySku) return bySku;

  const brand = input.brandName?.trim();
  const unit = input.inventoryUnit || "each";

  const candidates = await Ingredient.find({
    restaurantId,
    inventoryUnit: unit,
    ...(brand ? { brandName: brand } : {}),
  });

  let best: HydratedDocument<IIngredient> | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const nameScore = scoreMatch(input.name, candidate.name);
    if (brand && candidate.brandName) {
      const brandScore = scoreMatch(brand, candidate.brandName);
      if (brandScore < 0.7) continue;
    }
    if (nameScore > bestScore) {
      bestScore = nameScore;
      best = candidate;
    }
  }

  if (best && bestScore >= 0.85) return best;

  const slug = `ing-${input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
  const bySlug = await Ingredient.findOne({ restaurantId, slug });
  if (bySlug && bySlug.inventoryUnit === unit && scoreMatch(input.name, bySlug.name) >= 0.85) {
    return bySlug;
  }

  return null;
}

export function applyIngredientStockUpdate(
  ing: HydratedDocument<IIngredient>,
  params: {
    addQty: number;
    unitPrice?: number;
    orderedQty?: number;
    brandName?: string;
    sku: string;
  }
): void {
  ing.currentQty += params.addQty;
  if (params.unitPrice != null && params.unitPrice > 0) {
    ing.lastPurchasePrice = params.unitPrice;
  }
  if (params.orderedQty != null && params.orderedQty > 0) {
    ing.lastOrderedQty = params.orderedQty;
  }
  if (params.brandName?.trim()) {
    ing.brandName = params.brandName.trim();
  }
  if (!ing.sku) ing.sku = params.sku;
  ing.source = "bill_upload";
}
