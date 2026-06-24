import type { NewCatalogItem } from "@/lib/extract-new-items";
import { buildIngredientSku } from "@/lib/ingredient-sku";
import { resolveItemImageUrl } from "@/lib/image-selection";

export function buildIngredientPayload(item: NewCatalogItem) {
  const imageUrl = resolveItemImageUrl(item);
  const inventoryUnit = item.unit || "each";
  return {
    name: item.name,
    brandName: item.brandName || undefined,
    category: "misc",
    inventoryUnit,
    unit: inventoryUnit,
    reorderThreshold: 1,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    imageUrl: imageUrl || undefined,
    sku: buildIngredientSku({
      brandName: item.brandName,
      name: item.name,
      inventoryUnit,
      rawName: item.name,
    }),
  };
}

export async function relinkBillsForItems(items: NewCatalogItem[]): Promise<void> {
  const billIds = Array.from(new Set(items.map((i) => i.billId).filter(Boolean)));
  if (!billIds.length) return;
  try {
    await fetch("/api/bills/relink", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billIds }),
    });
  } catch {
    // best-effort
  }
}

export async function addCatalogItemToKitchen(
  item: NewCatalogItem
): Promise<{ ok: boolean; slug?: string; error?: string }> {
  const res = await fetch("/api/catalog/ingredients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildIngredientPayload(item)),
  });
  const data = await res.json();

  if (!res.ok && res.status !== 409) {
    return { ok: false, error: (data.error as string) ?? "Could not save item" };
  }

  return { ok: true, slug: data.slug as string | undefined };
}

export function countIncludedForAdd(items: NewCatalogItem[]): number {
  return items.filter((item) => item.includedForAdd !== false).length;
}

export function withCatalogDefaults(items: NewCatalogItem[]): NewCatalogItem[] {
  return items.map((item) => ({
    ...item,
    includedForAdd: item.includedForAdd ?? true,
  }));
}
