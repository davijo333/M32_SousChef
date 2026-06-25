import type { NewCatalogItem } from "@backend/services/catalog/extract-new-items";
import { applySuggestedImages } from "@backend/services/catalog/image-selection";

export type PipelineEnrichedRow = {
  key: string;
  normalized_name: string;
  brand_name?: string;
  sku?: string;
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

/** Merge agent pipeline enrichment onto new catalog review items by id key. */
export function applyPipelineEnrichment(
  items: NewCatalogItem[],
  enriched: PipelineEnrichedRow[]
): NewCatalogItem[] {
  if (!enriched.length) return items;
  const byKey = new Map(enriched.map((row) => [row.key, row]));
  return applySuggestedImages(
    items.map((item) => {
      const row = byKey.get(item.id);
      if (!row) return item;
      return {
        ...item,
        name: row.normalized_name || item.name,
        brandName: row.brand_name || item.brandName,
        imageSuggestions: row.images ?? [],
        imagesLoading: false,
        suggestedLinks: row.suggested_links,
        availableAddOnSlugs: row.available_add_on_slugs,
        addonsEnabled: row.addons_enabled,
      };
    })
  );
}
