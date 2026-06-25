export type UsageUnit = {
  unit: string;
  countPerInventoryUnit: number;
  notes?: string;
};

export type IngredientLike = {
  slug: string;
  inventoryUnit: string;
  currentQty: number;
  usageUnits: UsageUnit[];
};

export type SizeLike = {
  slug: string;
  scalePercent: number;
  priceMultiplier: number;
};

export function scaleQty(baseQty: number, scalePercent: number): number {
  return baseQty * (scalePercent / 100);
}

export function resolveUsageQty(
  baseQty: number,
  size: SizeLike | null,
  scalesWithSize = true
): number {
  if (!scalesWithSize || !size) return baseQty;
  return scaleQty(baseQty, size.scalePercent);
}

export function usageToInventoryQty(
  ingredient: IngredientLike,
  usageQty: number,
  usageUnit: string
): number {
  const conversion = ingredient.usageUnits.find((u) => u.unit === usageUnit);
  if (!conversion) {
    throw new Error(
      `No conversion for unit "${usageUnit}" on ${ingredient.slug}`
    );
  }
  return usageQty / conversion.countPerInventoryUnit;
}

export function inventoryToUsageQty(
  ingredient: IngredientLike,
  usageUnit: string
): number {
  const conversion = ingredient.usageUnits.find((u) => u.unit === usageUnit);
  if (!conversion) {
    throw new Error(`No conversion for unit "${usageUnit}" on ${ingredient.slug}`);
  }
  return ingredient.currentQty * conversion.countPerInventoryUnit;
}

export function formatStockAnswer(
  name: string,
  ingredient: IngredientLike,
  kitchenUnit?: string
): string {
  if (kitchenUnit && kitchenUnit !== ingredient.inventoryUnit) {
    try {
      const kitchenQty = inventoryToUsageQty(ingredient, kitchenUnit);
      return `${name}: ${kitchenQty.toFixed(1)} ${kitchenUnit} on hand (${ingredient.currentQty} ${ingredient.inventoryUnit} in stock).`;
    } catch {
      // fall through
    }
  }
  return `${name}: ${ingredient.currentQty} ${ingredient.inventoryUnit} on hand.`;
}
