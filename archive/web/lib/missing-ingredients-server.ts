import type { NewCatalogItem, ParsedBillLine } from "@/lib/extract-new-items";
import type { CustomerDeductionSummary } from "@/lib/missing-ingredients";
import { Ingredient } from "@/models/Ingredient";
import { MenuItem } from "@/models/MenuItem";

function slugToDisplayName(slug: string): string {
  return slug
    .replace(/^ing-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function missingItemId(ingredientSlug: string): string {
  return `missing-${ingredientSlug}`;
}

/**
 * Recipe links on matched menu items that point to ingredients not in the pantry.
 * Server-only — uses Mongoose.
 */
export async function extractMissingRecipeIngredients(
  restaurantId: string,
  bill: {
    billId: string;
    filename: string;
    billType?: string;
    lines: ParsedBillLine[];
  }
): Promise<CustomerDeductionSummary> {
  const empty: CustomerDeductionSummary = {
    missingIngredients: [],
    matchedWithoutRecipeLinks: 0,
    unmatchedMenuLines: 0,
  };

  if (bill.billType !== "customer") return empty;

  const pantrySlugs = new Set(
    (await Ingredient.find({ restaurantId }).select("slug").lean()).map((i) => i.slug)
  );

  const bySlug = new Map<string, NewCatalogItem & { neededForDishes: Set<string> }>();

  for (const line of bill.lines) {
    if (!line.included || line.suggestedCategory !== "menu_item") continue;

    if (!line.matchedMenuItemSlug) {
      empty.unmatchedMenuLines += 1;
      continue;
    }

    const menuItem = await MenuItem.findOne({
      restaurantId,
      slug: line.matchedMenuItemSlug,
    })
      .select("name slug ingredientLinks")
      .lean();

    if (!menuItem?.ingredientLinks?.length) {
      empty.matchedWithoutRecipeLinks += 1;
      continue;
    }

    for (const link of menuItem.ingredientLinks) {
      if (pantrySlugs.has(link.ingredientSlug)) continue;

      const existing = bySlug.get(link.ingredientSlug);
      const dishName = menuItem.name;
      if (existing) {
        existing.neededForDishes.add(dishName);
        existing.quantity = Math.max(existing.quantity, link.qtyPerServing * line.quantity);
        continue;
      }

      bySlug.set(link.ingredientSlug, {
        id: missingItemId(link.ingredientSlug),
        name: slugToDisplayName(link.ingredientSlug),
        rawName: `Recipe needs ${slugToDisplayName(link.ingredientSlug)} for ${dishName}`,
        unit: link.unit,
        unitPrice: 0,
        quantity: link.qtyPerServing * line.quantity,
        billId: bill.billId,
        sourceFilename: bill.filename,
        imageSuggestions: [],
        imagesLoading: true,
        includedForAdd: true,
        neededForDishes: new Set([dishName]),
      });
    }
  }

  const missingIngredients = Array.from(bySlug.values()).map((row) => {
    const dishes = Array.from(row.neededForDishes);
    return {
      id: row.id,
      name: row.name,
      rawName:
        dishes.length === 1
          ? `Needed for ${dishes[0]}`
          : `Needed for ${dishes.slice(0, 2).join(", ")}${dishes.length > 2 ? "…" : ""}`,
      unit: row.unit,
      unitPrice: row.unitPrice,
      quantity: row.quantity,
      billId: row.billId,
      sourceFilename: row.sourceFilename,
      imageSuggestions: row.imageSuggestions,
      imagesLoading: row.imagesLoading,
      includedForAdd: row.includedForAdd,
    };
  });

  return {
    missingIngredients,
    matchedWithoutRecipeLinks: empty.matchedWithoutRecipeLinks,
    unmatchedMenuLines: empty.unmatchedMenuLines,
  };
}
