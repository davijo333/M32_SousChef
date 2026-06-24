import type { NewCatalogItem } from "@/lib/extract-new-items";
import { mergeNewCatalogItems } from "@/lib/extract-new-items";

export type CustomerDeductionSummary = {
  missingIngredients: NewCatalogItem[];
  matchedWithoutRecipeLinks: number;
  unmatchedMenuLines: number;
};

export function mergeMissingIngredients(
  existing: NewCatalogItem[],
  incoming: NewCatalogItem[]
): NewCatalogItem[] {
  return mergeNewCatalogItems(existing, incoming);
}

export function customerBillIngestMessage(
  filename: string,
  deductedIngredients: number,
  summary: CustomerDeductionSummary
): string {
  if (deductedIngredients > 0) {
    return `${filename}: deducted ingredients for ${deductedIngredients} recipe line(s).`;
  }
  if (summary.missingIngredients.length > 0) {
    return `${filename}: saved — ${summary.missingIngredients.length} recipe ingredient(s) missing from kitchen.`;
  }
  if (summary.matchedWithoutRecipeLinks > 0) {
    const n = summary.matchedWithoutRecipeLinks;
    const label = n === 1 ? "sale" : "sales";
    return `${filename}: saved — ${n} matched ${label} (recipe links optional on Kitchen).`;
  }
  if (summary.unmatchedMenuLines > 0) {
    const n = summary.unmatchedMenuLines;
    const label = n === 1 ? "menu item" : "menu items";
    return `${filename}: saved — ${n} new ${label} to review on Kitchen (recipe links optional).`;
  }
  return `${filename}: saved (no menu sales to deduct).`;
}
