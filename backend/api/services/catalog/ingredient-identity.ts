import { scoreMatch } from "@backend/services/bills/bill-normalizer";
import type { IngredientIdentityInput } from "@backend/services/catalog/ingredient-sku";
import { Ingredient } from "@backend/models/Ingredient";
import type { HydratedDocument } from "mongoose";
import type { IIngredient } from "@backend/models/Ingredient";

export type { IngredientIdentityInput } from "@backend/services/catalog/ingredient-sku";
export { buildIngredientSku, extractVolumeFromName } from "@backend/services/catalog/ingredient-sku";

const PREP_PREFIX_RE =
  /^(?:ripe|fresh|frozen|diced|sliced|chopped|crushed|whole|organic|raw|unsweetened|sweetened|plain|low[- ]fat|non[- ]fat|fat[- ]free|large|small|medium)\s+/i;

const FORM_MAP: Record<string, string> = {
  "ice cubes": "Ice",
  "ice cube": "Ice",
  "crushed ice": "Ice",
  "bagged ice": "Ice",
};

function titleCaseIngredient(text: string): string {
  const small = new Set(["and", "or", "with", "of", "in"]);
  return text
    .split(/\s+/)
    .map((word) => (small.has(word.toLowerCase()) ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(" ");
}

/** Strip recipe prep words so pantry rows match store product names (Mango not Ripe Mango). */
export function basicPantryName(name: string): string {
  const text = name.replace(/\s*\([^)]*\)/g, "").trim();
  const lower = text.replace(/\s+/g, " ").trim().toLowerCase();
  for (const [phrase, canonical] of Object.entries(FORM_MAP).sort(
    (a, b) => b[0].length - a[0].length
  )) {
    if (lower === phrase || lower.includes(phrase)) return canonical;
  }
  let cleaned = text;
  for (let i = 0; i < 6; i += 1) {
    const next = cleaned.replace(PREP_PREFIX_RE, "").trim();
    if (next === cleaned) break;
    cleaned = next;
  }
  return cleaned ? titleCaseIngredient(cleaned) : name.trim();
}

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
  if (bySlug) return bySlug;

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
