import type { IIngredientLink } from "@backend/models/Dish";

/** Menu price = food cost × (1 + DEFAULT_MARGIN). 3.0 → 4× food cost (~25% food cost %). */
export const DEFAULT_RECIPE_MARGIN = 3.0;

export const PRICE_FLOORS: Record<string, number> = {
  sandwich: 4.49,
  "byo-sandwich": 3.49,
  coffee: 2.99,
  tea: 2.49,
  juice: 3.49,
};

export const ADDON_PRICE_FLOOR = 0.99;

/** Kitchen-unit → count per inventory unit */
const DEFAULT_USAGE_UNITS: Record<string, Record<string, number>> = {
  "ing-croissant": { each: 1 },
  "ing-sourdough-bread": { slice: 16, loaf: 1 },
  "ing-bagel": { each: 12, dozen: 1 },
  "ing-multigrain-bagel": { each: 12, dozen: 1 },
  "ing-bacon": { slice: 16, lb: 1 },
  "ing-sausage": { link: 8, lb: 1 },
  "ing-egg": { each: 12, dozen: 1 },
  "ing-cheddar": { oz: 16, slice: 24, lb: 1 },
  "ing-swiss": { oz: 16, slice: 24, lb: 1 },
  "ing-american": { oz: 16, slice: 24, lb: 1 },
  "ing-butter": { oz: 16, lb: 1 },
  "ing-spinach": { cup: 4, lb: 1 },
  "ing-tomato": { slice: 8, lb: 1 },
  "ing-bell-pepper": { cup: 4, lb: 1 },
  "ing-avocado": { each: 48, case: 1 },
  "ing-coffee-beans": { oz: 16, lb: 1 },
  "ing-espresso": { oz: 16, lb: 1 },
  "ing-whole-milk": { oz: 128, gallon: 1 },
  "ing-skim-milk": { oz: 128, gallon: 1 },
  "ing-oat-milk": { oz: 64, each: 1 },
  "ing-almond-milk": { oz: 64, each: 1 },
  "ing-soy-milk": { oz: 64, each: 1 },
  "ing-half-and-half": { oz: 32, quart: 1 },
  "ing-mocha-syrup": { oz: 25.4, each: 1 },
  "ing-vanilla-syrup": { oz: 25.4, each: 1 },
  "ing-caramel-syrup": { oz: 25.4, each: 1 },
  "ing-hazelnut-syrup": { oz: 25.4, each: 1 },
  "ing-ice": { oz: 16, lb: 1 },
  "ing-heavy-cream": { oz: 64, "half-gallon": 1 },
  "ing-frothing-milk": { oz: 128, gallon: 1 },
  "ing-black-tea": { bag: 100, box: 1 },
  "ing-green-tea": { bag: 100, box: 1 },
  "ing-orange-juice": { oz: 128, gallon: 1 },
  "ing-apple-juice": { oz: 128, gallon: 1 },
  "ing-cranberry-juice": { oz: 96, each: 1 },
};

type IngredientPriceInput = {
  slug: string;
  lastPurchasePrice?: number;
  usageUnits?: Array<{ unit: string; countPerInventoryUnit: number }>;
};

function usageFactor(
  slug: string,
  unit: string,
  usageUnits?: Array<{ unit: string; countPerInventoryUnit: number }>
): number {
  const fromIngredient = usageUnits?.find((u) => u.unit === unit)?.countPerInventoryUnit;
  if (fromIngredient != null && fromIngredient > 0) return fromIngredient;

  const defaults = DEFAULT_USAGE_UNITS[slug];
  if (defaults?.[unit] != null) return defaults[unit];

  if (unit === "each") return defaults?.each ?? 1;
  return 1;
}

export function ingredientUsageCost(
  slug: string,
  qty: number,
  unit: string,
  ingredient: IngredientPriceInput | undefined
): number {
  const price = ingredient?.lastPurchasePrice;
  if (price == null || !Number.isFinite(price) || price <= 0) return 0;
  const factor = usageFactor(slug, unit, ingredient?.usageUnits);
  return (qty / factor) * price;
}

export function computeRecipeFoodCost(
  links: IIngredientLink[],
  ingredientsBySlug: Map<string, IngredientPriceInput>
): number {
  let total = 0;
  for (const link of links) {
    total += ingredientUsageCost(
      link.ingredientSlug,
      link.qtyPerServing,
      link.unit,
      ingredientsBySlug.get(link.ingredientSlug)
    );
  }
  return Math.round((total + Number.EPSILON) * 100) / 100;
}

export function computeSellPriceFromCost(
  foodCost: number,
  options: { classification?: string; isAddon?: boolean; margin?: number } = {}
): number {
  const margin = options.margin ?? DEFAULT_RECIPE_MARGIN;
  let price = Math.round(foodCost * (1 + margin) * 100) / 100;
  if (options.isAddon) {
    price = Math.max(price, ADDON_PRICE_FLOOR);
  } else if (options.classification) {
    const floor = PRICE_FLOORS[options.classification.trim().toLowerCase()];
    if (floor != null) price = Math.max(price, floor);
  }
  return price;
}
