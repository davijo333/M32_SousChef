import type { ISalesOrderItem } from "@/models/SalesOrder";

export function startOfWeek(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

type SalesOrderLike = {
  saleDate?: Date;
  uploadDate: Date;
  items: ISalesOrderItem[];
};

export function buildSoldThisWeekMaps(orders: SalesOrderLike[]): {
  dish: Map<string, number>;
  addon: Map<string, number>;
} {
  const weekStart = startOfWeek();
  const dish = new Map<string, number>();
  const addon = new Map<string, number>();

  for (const order of orders) {
    const when = order.saleDate ?? order.uploadDate;
    if (!when || when < weekStart) continue;

    for (const item of order.items) {
      const slug = item.itemKind === "addon" ? item.addOnSlug : item.dishSlug;
      if (!slug) continue;
      const map = item.itemKind === "addon" ? addon : dish;
      map.set(slug, (map.get(slug) ?? 0) + item.qty);
    }
  }

  return { dish, addon };
}

export function formatMenuSellPrice(sellPrice: number): string {
  return sellPrice > 0 ? `$${sellPrice.toFixed(2)}` : "—";
}
