import type { IPurchaseOrderItem } from "@/models/PurchaseOrder";

type PurchaseOrderLike = {
  purchaseDate?: Date;
  uploadDate: Date;
  items: IPurchaseOrderItem[];
};

export function buildLastPurchaseDateByIngredientSlug(
  orders: PurchaseOrderLike[]
): Map<string, Date> {
  const map = new Map<string, Date>();

  for (const order of orders) {
    const when = order.purchaseDate ?? order.uploadDate;
    if (!when) continue;

    for (const item of order.items) {
      if (!item.ingredientSlug) continue;
      const prev = map.get(item.ingredientSlug);
      if (!prev || when > prev) {
        map.set(item.ingredientSlug, when);
      }
    }
  }

  return map;
}

export function formatIngredientPrice(price?: number): string {
  return price != null && price > 0 ? `$${price.toFixed(2)}` : "—";
}

export function formatLastBoughtDate(value?: string | Date | null): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatInventoryLevel(qty: number, unit: string): string {
  return `${qty} ${unit}`;
}
