/**
 * Convert menu usage qty (kitchen unit) → inventory deduction (purchase unit).
 * @see docs/db/unit-conversions.md
 * @see docs/db/sizes.md
 */

export type UsageUnit = {
  unit: string;
  countPerInventoryUnit: number;
  notes?: string;
};

export type Ingredient = {
  id: string;
  inventoryUnit: string;
  currentQty: number;
  usageUnits: UsageUnit[];
};

export type Size = {
  id: string;
  scalePercent: number;
  priceMultiplier: number;
};

/** Base recipe qty at 100% (medium) → sized qty */
export function scaleQty(baseQty: number, scalePercent: number): number {
  return baseQty * (scalePercent / 100);
}

export function resolveSellPrice(basePrice: number, size: Size): number {
  return basePrice * size.priceMultiplier;
}

/** Apply size scaling before unit conversion */
export function resolveUsageQty(
  baseQty: number,
  size: Size | null,
  scalesWithSize = true
): number {
  if (!scalesWithSize || !size) return baseQty;
  return scaleQty(baseQty, size.scalePercent);
}

/**
 * Example: 2 slices bacon, 16 slices/lb → deduct 0.125 lb
 */
export function usageToInventoryQty(
  ingredient: Ingredient,
  usageQty: number,
  usageUnit: string
): number {
  const conversion = ingredient.usageUnits.find((u) => u.unit === usageUnit);
  if (!conversion) {
    throw new Error(
      `No conversion for unit "${usageUnit}" on ingredient ${ingredient.id} (stocked in ${ingredient.inventoryUnit})`
    );
  }
  return usageQty / conversion.countPerInventoryUnit;
}

/**
 * Example: 8 lb bacon, 16 slices/lb → 128 slices on hand
 */
export function inventoryToUsageQty(
  ingredient: Ingredient,
  usageUnit: string
): number {
  const conversion = ingredient.usageUnits.find((u) => u.unit === usageUnit);
  if (!conversion) {
    throw new Error(
      `No conversion for unit "${usageUnit}" on ingredient ${ingredient.id}`
    );
  }
  return ingredient.currentQty * conversion.countPerInventoryUnit;
}

/** Full pipeline: base recipe → size → inventory deduction */
export function deductForOrderLine(
  ingredient: Ingredient,
  baseQty: number,
  usageUnit: string,
  size: Size | null,
  scalesWithSize = true
): Ingredient {
  const usageQty = resolveUsageQty(baseQty, size, scalesWithSize);
  return deductForUsage(ingredient, usageQty, usageUnit);
}

/** Apply depletion after a menu item sale */
export function deductForUsage(
  ingredient: Ingredient,
  usageQty: number,
  usageUnit: string
): Ingredient {
  const deduction = usageToInventoryQty(ingredient, usageQty, usageUnit);
  return {
    ...ingredient,
    currentQty: Math.max(0, ingredient.currentQty - deduction),
  };
}
