import type { NewCatalogItem } from "@backend/services/catalog/extract-new-items";
import { applySuggestedImages } from "@backend/services/catalog/image-selection";

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";

type AgentPrepareResult = {
  key: string;
  normalized_name: string;
  brand_name?: string;
  images: NewCatalogItem["imageSuggestions"];
  suggested_links?: Array<{
    ingredientSlug: string;
    qtyPerServing: number;
    unit: string;
    scalesWithSize?: boolean;
  }>;
  available_add_on_slugs?: string[];
  addons_enabled?: boolean;
};

function toAgentItems(items: NewCatalogItem[]) {
  return items.map((item) => ({
    key: item.id,
    name: item.name,
    raw_name: item.rawName,
    item_type: item.id.startsWith("dish-") ? "dish" : "ingredient",
    store_name: item.storeName ?? "",
    quantity: item.quantity,
    unit: item.unit,
  }));
}

function applyPrepareResults(
  items: NewCatalogItem[],
  results: AgentPrepareResult[]
): NewCatalogItem[] {
  const byKey = new Map(results.map((r) => [r.key, r]));
  return applySuggestedImages(
    items.map((item) => {
      const row = byKey.get(item.id);
      if (!row) return { ...item, imagesLoading: false };
      return {
        ...item,
        name: row.normalized_name || item.name,
        brandName: row.brand_name || item.brandName,
        imageSuggestions: row.images ?? [],
        imagesLoading: false,
        includedForAdd: item.includedForAdd ?? true,
        suggestedLinks: row.suggested_links,
        availableAddOnSlugs: row.available_add_on_slugs,
        addonsEnabled: row.addons_enabled,
      };
    })
  );
}

/** One agent round-trip: 2a normalizer + 2 images for supplier ingredients. */
export async function enrichNewItemsWithAgent(
  ingredients: NewCatalogItem[],
  dishes: NewCatalogItem[] = []
): Promise<{ ingredients: NewCatalogItem[]; dishes: NewCatalogItem[] }> {
  const items = [...toAgentItems(ingredients), ...toAgentItems(dishes)];
  if (!items.length) return { ingredients, dishes };

  try {
    const res = await fetch(`${AGENT_URL}/prepare-catalog-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) {
      return {
        ingredients: ingredients.map((i) => ({ ...i, imagesLoading: false })),
        dishes: dishes.map((i) => ({ ...i, imagesLoading: false })),
      };
    }
    const data = (await res.json()) as { results: AgentPrepareResult[] };
    const ingKeys = new Set(ingredients.map((i) => i.id));
    const dishKeys = new Set(dishes.map((i) => i.id));
    const results = data.results ?? [];

    return {
      ingredients: applyPrepareResults(
        ingredients,
        results.filter((r) => ingKeys.has(r.key))
      ),
      dishes: applyPrepareResults(
        dishes,
        results.filter((r) => dishKeys.has(r.key))
      ),
    };
  } catch {
    return {
      ingredients: ingredients.map((i) => ({ ...i, imagesLoading: false })),
      dishes: dishes.map((i) => ({ ...i, imagesLoading: false })),
    };
  }
}
