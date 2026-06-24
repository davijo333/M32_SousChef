import { dishClassKey, dishClassLabel, ingredientClassKey, ingredientClassLabel } from "@/lib/catalog-classification";
import {
  type DashboardFinanceView,
  financePeriodKeys,
  isIngredientExpiring,
} from "@/lib/dashboard-stats";
import { startOfWeek } from "@/lib/menu-sales-stats";
import type { RecipeStatus } from "@/models/Dish";
import type { ISalesOrderItem } from "@/models/SalesOrder";

export const SALES_RANKING_LIMIT = 10;

/** Within 50% above reorder threshold counts as approaching. */
const REORDER_APPROACH_MULTIPLIER = 1.5;

export type SalesRankingRow = {
  slug: string;
  name: string;
  classKey: string;
  value: number;
};

export type ExpiryRankingRow = {
  slug: string;
  name: string;
  classKey: string;
  value: number;
  currentQty: number;
  inventoryUnit: string;
  daysLeft: number;
};

export type ReorderRankingRow = {
  slug: string;
  name: string;
  classKey: string;
  value: number;
  currentQty: number;
  reorderThreshold: number;
  inventoryUnit: string;
};

type SalesOrderInput = {
  saleDate?: Date;
  uploadDate: Date;
  items: ISalesOrderItem[];
};

type DishInput = {
  slug: string;
  name: string;
  classification?: string;
  category?: string;
  recipeStatus?: RecipeStatus;
  ingredientLinks?: Array<{
    ingredientSlug: string;
    qtyPerServing: number;
    unit: string;
  }>;
};

type IngredientInput = {
  slug: string;
  name: string;
  category: string;
  inventoryUnit: string;
  currentQty: number;
  reorderThreshold: number;
  expiryDate?: Date | null;
};

type RecipeInput = {
  kind: "dish" | "addon";
  targetSlug: string;
  ingredients: Array<{
    ingredientSlug: string;
    ingredientName: string;
    qtyUsed: number;
    unit: string;
  }>;
};

function periodKeyForDate(date: Date, view: DashboardFinanceView): string {
  if (view === "month") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  const weekStart = startOfWeek(date);
  return weekStart.toISOString().slice(0, 10);
}

function salesOrdersInWindow(
  orders: SalesOrderInput[],
  view: DashboardFinanceView,
  periodCount: number
): SalesOrderInput[] {
  const keys = financePeriodKeys(view, periodCount);
  return orders.filter((order) => {
    const when = order.saleDate ?? order.uploadDate;
    return keys.has(periodKeyForDate(when, view));
  });
}

function dishClassification(dish: DishInput): string {
  return dish.classification ?? dish.category ?? "other";
}

export function buildSalesClassOptions(
  dishes: DishInput[],
  ingredients: IngredientInput[]
): {
  dishClasses: Array<{ value: string; label: string }>;
  ingredientClasses: Array<{ value: string; label: string }>;
} {
  const dishKeys = new Set<string>();
  for (const dish of dishes) {
    if ((dish.recipeStatus ?? "new") !== "active") continue;
    dishKeys.add(dishClassKey(dishClassification(dish)));
  }

  const ingKeys = new Set<string>();
  for (const ingredient of ingredients) {
    ingKeys.add(ingredientClassKey(ingredient.category));
  }

  return {
    dishClasses: Array.from(dishKeys)
      .sort()
      .map((value) => ({ value, label: dishClassLabel(value) })),
    ingredientClasses: Array.from(ingKeys)
      .sort()
      .map((value) => ({ value, label: ingredientClassLabel(value) })),
  };
}

export function buildDishSalesRankings(
  salesOrders: SalesOrderInput[],
  dishes: DishInput[],
  view: DashboardFinanceView,
  periodCount: number,
  order: "most" | "least" = "most"
): SalesRankingRow[] {
  const activeDishes = dishes.filter((dish) => (dish.recipeStatus ?? "new") === "active");

  const soldBySlug = new Map(activeDishes.map((dish) => [dish.slug, 0]));
  for (const orderRow of salesOrdersInWindow(salesOrders, view, periodCount)) {
    for (const item of orderRow.items) {
      if (item.itemKind === "addon" || !item.dishSlug) continue;
      if (!soldBySlug.has(item.dishSlug)) continue;
      soldBySlug.set(item.dishSlug, (soldBySlug.get(item.dishSlug) ?? 0) + item.qty);
    }
  }

  const rows: SalesRankingRow[] = activeDishes.map((dish) => ({
    slug: dish.slug,
    name: dish.name,
    classKey: dishClassKey(dishClassification(dish)),
    value: soldBySlug.get(dish.slug) ?? 0,
  }));

  return rows
    .sort((a, b) => (order === "most" ? b.value - a.value : a.value - b.value))
    .slice(0, SALES_RANKING_LIMIT);
}

export function buildTopSellingDishes(
  salesOrders: SalesOrderInput[],
  dishes: DishInput[],
  view: DashboardFinanceView,
  periodCount: number
): SalesRankingRow[] {
  return buildDishSalesRankings(salesOrders, dishes, view, periodCount, "most");
}

export function buildLeastSellingDishes(
  salesOrders: SalesOrderInput[],
  dishes: DishInput[],
  view: DashboardFinanceView,
  periodCount: number
): SalesRankingRow[] {
  return buildDishSalesRankings(salesOrders, dishes, view, periodCount, "least");
}

export function buildTopUsedIngredients(
  salesOrders: SalesOrderInput[],
  dishes: DishInput[],
  recipes: RecipeInput[],
  ingredients: IngredientInput[],
  view: DashboardFinanceView,
  periodCount: number
): SalesRankingRow[] {
  const dishBySlug = new Map(dishes.map((dish) => [dish.slug, dish]));
  const ingBySlug = new Map(ingredients.map((ing) => [ing.slug, ing]));
  const recipeByKey = new Map(recipes.map((r) => [`${r.kind}:${r.targetSlug}`, r]));

  const usedBySlug = new Map<string, number>();

  for (const order of salesOrdersInWindow(salesOrders, view, periodCount)) {
    for (const item of order.items) {
      const isAddon = item.itemKind === "addon" || Boolean(item.addOnSlug);
      const slug = isAddon ? item.addOnSlug : item.dishSlug;
      if (!slug) continue;

      const kind = isAddon ? "addon" : "dish";
      const recipe = recipeByKey.get(`${kind}:${slug}`);
      const links =
        recipe?.ingredients.map((line) => ({
          ingredientSlug: line.ingredientSlug,
          qtyPerServing: line.qtyUsed,
        })) ??
        dishBySlug.get(slug)?.ingredientLinks?.map((link) => ({
          ingredientSlug: link.ingredientSlug,
          qtyPerServing: link.qtyPerServing,
        })) ??
        [];

      for (const link of links) {
        const used = link.qtyPerServing * item.qty;
        usedBySlug.set(link.ingredientSlug, (usedBySlug.get(link.ingredientSlug) ?? 0) + used);
      }
    }
  }

  const rows: SalesRankingRow[] = [];
  for (const [slug, qty] of Array.from(usedBySlug.entries())) {
    const ing = ingBySlug.get(slug);
    if (!ing) continue;
    rows.push({
      slug,
      name: ing.name,
      classKey: ingredientClassKey(ing.category),
      value: Math.round(qty * 100) / 100,
    });
  }

  return rows.sort((a, b) => b.value - a.value).slice(0, SALES_RANKING_LIMIT);
}

export function buildApproachingExpiry(ingredients: IngredientInput[]): ExpiryRankingRow[] {
  const now = Date.now();
  const rows: ExpiryRankingRow[] = [];

  for (const ing of ingredients) {
    if (!isIngredientExpiring(ing, now)) continue;
    const expiry = new Date(ing.expiryDate!).getTime();
    const daysLeft = Math.max(0, Math.ceil((expiry - now) / 86400000));
    rows.push({
      slug: ing.slug,
      name: ing.name,
      classKey: ingredientClassKey(ing.category),
      value: Math.max(1, 7 - daysLeft),
      currentQty: ing.currentQty,
      inventoryUnit: ing.inventoryUnit,
      daysLeft,
    });
  }

  return rows
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, SALES_RANKING_LIMIT);
}

export function buildReorderDiffRankings(
  ingredients: IngredientInput[],
  order: "most" | "least" = "most"
): ReorderRankingRow[] {
  const rows: ReorderRankingRow[] = [];

  for (const ing of ingredients) {
    const threshold = Math.max(ing.reorderThreshold, 1);
    const approachLevel = threshold * REORDER_APPROACH_MULTIPLIER;
    if (ing.currentQty > approachLevel) continue;

    const reorderDiff = ing.currentQty - ing.reorderThreshold;
    rows.push({
      slug: ing.slug,
      name: ing.name,
      classKey: ingredientClassKey(ing.category),
      value: reorderDiff,
      currentQty: ing.currentQty,
      reorderThreshold: ing.reorderThreshold,
      inventoryUnit: ing.inventoryUnit,
    });
  }

  return rows
    .sort((a, b) => (order === "most" ? a.value - b.value : b.value - a.value))
    .slice(0, SALES_RANKING_LIMIT);
}

export function buildApproachingReorder(ingredients: IngredientInput[]): ReorderRankingRow[] {
  return buildReorderDiffRankings(ingredients, "most");
}

export function buildLeastReorderDiff(ingredients: IngredientInput[]): ReorderRankingRow[] {
  return buildReorderDiffRankings(ingredients, "least");
}

export function filterByClassKeys<T extends { classKey: string }>(
  rows: T[],
  classFilters: string[]
): T[] {
  if (!classFilters.length) return rows;
  const allowed = new Set(classFilters);
  return rows.filter((row) => allowed.has(row.classKey));
}
