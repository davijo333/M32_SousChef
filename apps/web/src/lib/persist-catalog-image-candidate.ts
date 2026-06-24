import type { IImageCandidate } from "@/models/Ingredient";
import {
  persistCatalogImageToSlug,
  type CatalogCollection,
  type CatalogImageSlot,
} from "@/lib/r2-storage";

type AgentImageSuggestion = {
  url: string;
  label?: string;
  source?: string;
  score?: number;
};

/** Download, validate, and store one catalog image. Throws if the file cannot be persisted. */
export async function persistCatalogImageCandidate(
  collection: CatalogCollection,
  slug: string,
  slot: CatalogImageSlot,
  img: AgentImageSuggestion
): Promise<IImageCandidate> {
  const stored = await persistCatalogImageToSlug(collection, slug, slot, img.url);
  return {
    url: stored.publicUrl,
    r2Key: stored.r2Key,
    label: img.label,
    source: img.source ?? "regenerated",
    score: img.score,
  };
}

export function slotForImageIndex(index: number): CatalogImageSlot {
  return index === 0 ? "default" : "secondary";
}
