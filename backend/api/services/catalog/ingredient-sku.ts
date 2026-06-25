/** Client-safe SKU helpers — no MongoDB / Mongoose imports. */

function skuPart(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Pull pack size from product name, e.g. "Milk 1 Gal" → { qty: 1, unit: "gal" }. */
export function extractVolumeFromName(name: string): { qty: number; unit: string } | null {
  const match = name.match(
    /\b(\d+(?:\.\d+)?)\s*(oz|lb|lbs|g|kg|ml|l|gal|gallon|ct|count|pk|pack|dz|dozen)\b/i
  );
  if (!match) return null;
  let unit = match[2].toLowerCase();
  if (unit === "lbs") unit = "lb";
  if (unit === "gallon") unit = "gal";
  if (unit === "dozen") unit = "dz";
  if (unit === "count") unit = "ct";
  if (unit === "pack") unit = "pk";
  return { qty: parseFloat(match[1]), unit };
}

export type IngredientIdentityInput = {
  brandName?: string;
  name: string;
  inventoryUnit: string;
  rawName?: string;
};

/**
 * Stable SKU from store brand + product name + pack volume in one unit.
 * Example: Sysco, Large Eggs, dozen → sysco-large-eggs-1-dz
 */
export function buildIngredientSku(input: IngredientIdentityInput): string {
  const brand = skuPart(input.brandName?.trim() || "generic");
  const product = skuPart(input.name);
  const volume = extractVolumeFromName(input.rawName || input.name);
  const unit = skuPart(volume?.unit || input.inventoryUnit || "each");
  const packQty =
    volume?.qty != null ? String(volume.qty).replace(/\.0$/, "") : "1";
  return [brand, product, packQty, unit].filter(Boolean).join("-");
}
