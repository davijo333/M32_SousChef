export type ImageSuggestion = {
  url: string;
  label: string;
  source: string;
  score?: number;
};

export type ParsedBillLine = {
  rawName: string;
  normalizedName?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  confidence: number;
  suggestedCategory: string;
  included: boolean;
  matchedIngredientSlug?: string;
  matchedMenuItemSlug?: string;
};

export type NewCatalogItem = {
  id: string;
  name: string;
  rawName: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  billId: string;
  sourceFilename: string;
  /** Retailer / store from bill header — not the product brand */
  storeName?: string;
  brandName?: string;
  imageSuggestions: ImageSuggestion[];
  imagesLoading?: boolean;
  /** Agent-picked or bulk-default image URL */
  selectedImageUrl?: string;
  /** True when the owner tapped a different photo in the review modal */
  imageSelectionManual?: boolean;
  /** Included in bulk add — false when owner unchecks the card */
  includedForAdd?: boolean;
  /** Recipe linker output — applied when adding dish to kitchen */
  suggestedLinks?: Array<{
    ingredientSlug: string;
    qtyPerServing: number;
    unit: string;
    scalesWithSize?: boolean;
  }>;
  availableAddOnSlugs?: string[];
  addonsEnabled?: boolean;
};

export type ParsedBillResult = {
  billId: string;
  filename: string;
  vendor?: string;
  lines: ParsedBillLine[];
  newIngredients?: NewCatalogItem[];
  newDishes?: NewCatalogItem[];
};

function normalizeKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function itemId(type: "ingredient" | "dish", name: string) {
  return `${type}-${normalizeKey(name).replace(/\s+/g, "-")}`;
}

function isSkippableLine(name: string) {
  const n = normalizeKey(name);
  return n === "tax" || n === "tip" || n === "total" || n === "subtotal";
}

export function extractNewItemsFromBill(result: {
  billId: string;
  filename: string;
  vendor?: string;
  billType?: "supplier" | "customer";
  lines: ParsedBillLine[];
}): {
  ingredients: NewCatalogItem[];
  dishes: NewCatalogItem[];
} {
  const ingredients: NewCatalogItem[] = [];
  const dishes: NewCatalogItem[] = [];
  const supplierStore = result.billType === "supplier" ? result.vendor?.trim() : undefined;

  for (const line of result.lines) {
    const name = line.normalizedName ?? line.rawName;
    if (!name || isSkippableLine(name)) continue;

    if (line.suggestedCategory === "ingredient" && !line.matchedIngredientSlug) {
      ingredients.push({
        id: itemId("ingredient", line.rawName),
        name,
        rawName: line.rawName,
        unit: line.unit,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        billId: result.billId,
        sourceFilename: result.filename,
        storeName: supplierStore || undefined,
        imageSuggestions: [],
        imagesLoading: true,
        includedForAdd: true,
      });
    }

    if (line.suggestedCategory === "menu_item" && !line.matchedMenuItemSlug) {
      dishes.push({
        id: itemId("dish", line.rawName),
        name,
        rawName: line.rawName,
        unit: line.unit,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        billId: result.billId,
        sourceFilename: result.filename,
        imageSuggestions: [],
        imagesLoading: true,
        includedForAdd: true,
      });
    }
  }

  return { ingredients, dishes };
}

export function mergeNewCatalogItems(
  existing: NewCatalogItem[],
  incoming: NewCatalogItem[]
): NewCatalogItem[] {
  const map = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) {
    const prev = map.get(item.id);
    if (!prev) {
      map.set(item.id, { ...item, includedForAdd: item.includedForAdd ?? true });
      continue;
    }
    map.set(item.id, {
      ...prev,
      ...item,
      imageSuggestions: item.imageSuggestions.length
        ? item.imageSuggestions
        : prev.imageSuggestions,
      imagesLoading: item.imagesLoading ?? prev.imagesLoading,
      brandName: item.brandName || prev.brandName,
      storeName: item.storeName || prev.storeName,
      imageSelectionManual: prev.imageSelectionManual ?? item.imageSelectionManual,
      selectedImageUrl: prev.imageSelectionManual
        ? prev.selectedImageUrl ?? item.selectedImageUrl
        : item.selectedImageUrl ?? prev.selectedImageUrl,
      includedForAdd: item.includedForAdd ?? prev.includedForAdd ?? true,
    });
  }
  return Array.from(map.values());
}
