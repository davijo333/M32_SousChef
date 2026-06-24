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

export function buildTopSellingDishes(
  salesOrders: SalesOrderInput[],
  dishes: DishInput[],
  view: DashboardFinanceView,
  periodCount: number
): SalesRankingRow[] {
  const activeDishes = new Map(
    dishes
      .filter((dish) => (dish.recipeStatus ?? "new") === "active")
      .map((dish) => [dish.slug, dish])
  );

  const soldBySlug = new Map<string, number>();
  for (const order of salesOrdersInWindow(salesOrders, view, periodCount)) {
    for (const item of order.items) {
      if (item.itemKind === "addon" || !item.dishSlug) continue;
      if (!activeDishes.has(item.dishSlug)) continue;
      soldBySlug.set(item.dishSlug, (soldBySlug.get(item.dishSlug) ?? 0) + item.qty);
    }
  }

  const rows: SalesRankingRow[] = [];
  for (const [slug, qty] of Array.from(soldBySlug.entries())) {
    const dish = activeDishes.get(slug);
    if (!dish) continue;
    rows.push({
      slug,
      name: dish.name,
      classKey: dishClassKey(dishClassification(dish)),
      value: qty,
    });
  }

  return rows.sort((a, b) => b.value - a.value).slice(0, SALES_RANKING_LIMIT);
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

export function buildApproachingReorder(ingredients: IngredientInput[]): ReorderRankingRow[] {
  const rows: ReorderRankingRow[] = [];

  for (const ing of ingredients) {
    const threshold = Math.max(ing.reorderThreshold, 1);
    const approachLevel = threshold * REORDER_APPROACH_MULTIPLIER;
    if (ing.currentQty > approachLevel) continue;

    const fillRatio = ing.currentQty / threshold;
    rows.push({
      slug: ing.slug,
      name: ing.name,
      classKey: ingredientClassKey(ing.category),
      value: Math.round(fillRatio * 100) / 100,
      currentQty: ing.currentQty,
      reorderThreshold: ing.reorderThreshold,
      inventoryUnit: ing.inventoryUnit,
    });
  }

  return rows
    .sort((a, b) => a.value - b.value)
    .slice(0, SALES_RANKING_LIMIT);
}

export function filterByClassKeys<T extends { classKey: string }>(
  rows: T[],
  classFilters: string[]
): T[] {
  if (!classFilters.length) return rows;
  const allowed = new Set(classFilters);
  return rows.filter((row) => allowed.has(row.classKey));
}
