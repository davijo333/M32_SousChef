import { isIngredientRequired } from "@/lib/ingredient-pantry-status";
import { startOfWeek } from "@/lib/menu-sales-stats";
import type { IIngredient } from "@/models/Ingredient";
import type { IPurchaseOrderItem } from "@/models/PurchaseOrder";
import type { ISalesOrderItem } from "@/models/SalesOrder";
import type { RecipeStatus } from "@/models/Dish";

export const EXPIRING_WITHIN_MS = 7 * 86400000;

type OrderItemLike = { price: number; qty: number };

type DatedOrderLike = {
  orderDate?: Date | null;
  fallbackDate: Date;
  items: OrderItemLike[];
};

export type FinancePeriodPoint = {
  periodKey: string;
  label: string;
  sales: number;
  expenses: number;
};

export type DashboardFinanceView = "week" | "month";

export function orderItemsTotal(items: OrderItemLike[]): number {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

export function isIngredientExpiring(
  ingredient: Pick<IIngredient, "expiryDate">,
  now = Date.now()
): boolean {
  if (!ingredient.expiryDate) return false;
  const expiry = new Date(ingredient.expiryDate).getTime();
  return expiry >= now && expiry - now <= EXPIRING_WITHIN_MS;
}

export function countDishStats(dishes: Array<{ recipeStatus?: RecipeStatus }>) {
  let active = 0;
  let suggested = 0;
  for (const dish of dishes) {
    const status = dish.recipeStatus ?? "new";
    if (status === "active") active += 1;
    if (status === "suggested") suggested += 1;
  }
  return {
    total: dishes.length,
    active,
    suggested,
  };
}

export function countIngredientStats(
  ingredients: Array<
    Pick<IIngredient, "currentQty" | "reorderThreshold" | "label" | "expiryDate">
  >
) {
  let required = 0;
  let expiring = 0;
  const now = Date.now();

  for (const ingredient of ingredients) {
    if (isIngredientRequired(ingredient)) required += 1;
    if (isIngredientExpiring(ingredient, now)) expiring += 1;
  }

  return {
    total: ingredients.length,
    required,
    expiring,
  };
}

function startOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d;
}

function periodKeyForDate(date: Date, view: DashboardFinanceView): string {
  if (view === "month") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  const weekStart = startOfWeek(date);
  return weekStart.toISOString().slice(0, 10);
}

function formatPeriodLabel(date: Date, view: DashboardFinanceView): string {
  if (view === "month") {
    return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  }
  const weekStart = startOfWeek(date);
  return weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function resolveOrderDate(order: DatedOrderLike): Date {
  return order.orderDate ?? order.fallbackDate;
}

export function buildFinanceTimeline(
  salesOrders: Array<{ saleDate?: Date; uploadDate: Date; items: ISalesOrderItem[] }>,
  purchaseOrders: Array<{
    purchaseDate?: Date;
    uploadDate: Date;
    items: IPurchaseOrderItem[];
  }>,
  view: DashboardFinanceView = "week",
  periodCount = 8
): FinancePeriodPoint[] {
  const datedSales: DatedOrderLike[] = salesOrders.map((order) => ({
    orderDate: order.saleDate,
    fallbackDate: order.uploadDate,
    items: order.items,
  }));
  const datedPurchases: DatedOrderLike[] = purchaseOrders.map((order) => ({
    orderDate: order.purchaseDate,
    fallbackDate: order.uploadDate,
    items: order.items,
  }));

  const anchor = new Date();
  anchor.setHours(0, 0, 0, 0);

  const buckets = new Map<string, FinancePeriodPoint>();

  for (let index = periodCount - 1; index >= 0; index -= 1) {
    const cursor = new Date(anchor);
    if (view === "month") {
      cursor.setMonth(cursor.getMonth() - index, 1);
    } else {
      cursor.setDate(cursor.getDate() - index * 7);
      const weekStart = startOfWeek(cursor);
      cursor.setTime(weekStart.getTime());
    }

    const key = periodKeyForDate(cursor, view);
    buckets.set(key, {
      periodKey: key,
      label: formatPeriodLabel(cursor, view),
      sales: 0,
      expenses: 0,
    });
  }

  for (const order of datedSales) {
    const when = resolveOrderDate(order);
    const key = periodKeyForDate(when, view);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.sales += orderItemsTotal(order.items);
  }

  for (const order of datedPurchases) {
    const when = resolveOrderDate(order);
    const key = periodKeyForDate(when, view);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.expenses += orderItemsTotal(order.items);
  }

  return Array.from(buckets.values());
}

export type FinanceSummary = {
  sales: number;
  soldCogs: number;
  grossProfit: number;
  grossMarginPercent: number;
  supplierPurchases: number;
  posTickets: number;
  itemsSold: number;
};

type RecipeCostRef = { foodCost: number };

export function financePeriodKeys(
  view: DashboardFinanceView,
  periodCount: number,
  now = new Date()
): Set<string> {
  const anchor = new Date(now);
  anchor.setHours(0, 0, 0, 0);
  const keys = new Set<string>();

  for (let index = periodCount - 1; index >= 0; index -= 1) {
    const cursor = new Date(anchor);
    if (view === "month") {
      cursor.setMonth(cursor.getMonth() - index, 1);
    } else {
      cursor.setDate(cursor.getDate() - index * 7);
      const weekStart = startOfWeek(cursor);
      cursor.setTime(weekStart.getTime());
    }
    keys.add(periodKeyForDate(cursor, view));
  }

  return keys;
}

/** POS revenue, COGS for items actually sold, and wholesale purchases in the finance window. */
export function computeFinanceSummary(
  salesOrders: Array<{
    saleDate?: Date;
    uploadDate: Date;
    items: Array<
      ISalesOrderItem & { dishSlug?: string; addOnSlug?: string; itemKind?: string }
    >;
  }>,
  purchaseOrders: Array<{
    purchaseDate?: Date;
    uploadDate: Date;
    items: IPurchaseOrderItem[];
  }>,
  recipesByKey: Map<string, RecipeCostRef>,
  view: DashboardFinanceView = "week",
  periodCount = 8,
  now = new Date()
): FinanceSummary {
  const keys = financePeriodKeys(view, periodCount, now);

  let sales = 0;
  let soldCogs = 0;
  let itemsSold = 0;
  let posTickets = 0;

  for (const order of salesOrders) {
    const when = resolveOrderDate({
      orderDate: order.saleDate,
      fallbackDate: order.uploadDate,
      items: order.items,
    });
    if (!keys.has(periodKeyForDate(when, view))) continue;

    posTickets += 1;
    for (const item of order.items) {
      sales += item.price * item.qty;
      itemsSold += item.qty;

      const recipeKey = item.dishSlug
        ? `dish:${item.dishSlug}`
        : item.addOnSlug
          ? `addon:${item.addOnSlug}`
          : null;
      if (!recipeKey) continue;
      const recipe = recipesByKey.get(recipeKey);
      soldCogs += (recipe?.foodCost ?? 0) * item.qty;
    }
  }

  let supplierPurchases = 0;
  for (const order of purchaseOrders) {
    const when = resolveOrderDate({
      orderDate: order.purchaseDate,
      fallbackDate: order.uploadDate,
      items: order.items,
    });
    if (!keys.has(periodKeyForDate(when, view))) continue;
    supplierPurchases += orderItemsTotal(order.items);
  }

  const grossProfit = Math.round((sales - soldCogs) * 100) / 100;
  const grossMarginPercent =
    sales > 0 ? Math.round((grossProfit / sales) * 1000) / 10 : 0;

  return {
    sales: Math.round(sales * 100) / 100,
    soldCogs: Math.round(soldCogs * 100) / 100,
    grossProfit,
    grossMarginPercent,
    supplierPurchases: Math.round(supplierPurchases * 100) / 100,
    posTickets,
    itemsSold,
  };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}
