import type { IImageCandidate } from "@backend/models/Ingredient";
import {
  persistCatalogImageToSlug,
  type CatalogCollection,
  type CatalogImageSlot,
} from "@backend/services/infra/r2-storage";

type AgentImageSuggestion = {
  url: string;
  label?: string;
  source?: string;
  score?: number;
};

/** How many remote URLs to request — many hotlinks 404 when downloaded server-side. */
export const IMAGE_FETCH_POOL_SIZE = 8;

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

/** Try each suggestion until one downloads; web search URLs often expire or block bots. */
export async function persistFirstAvailableCatalogImage(
  collection: CatalogCollection,
  slug: string,
  slot: CatalogImageSlot,
  images: AgentImageSuggestion[]
): Promise<{ candidate: IImageCandidate; sourceUrl: string }> {
  if (!images.length) {
    throw new Error("No image candidates to persist");
  }

  const errors: string[] = [];
  for (const img of images) {
    try {
      const candidate = await persistCatalogImageCandidate(collection, slug, slot, img);
      return { candidate, sourceUrl: img.url };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  throw new Error(errors[0] ?? "No downloadable images found");
}

/** Fill one or more slots from a ranked pool, skipping URLs already used. */
export async function persistCatalogSlotsFromPool(
  collection: CatalogCollection,
  slug: string,
  slotCount: number,
  pool: AgentImageSuggestion[]
): Promise<IImageCandidate[]> {
  const used = new Set<string>();
  const results: IImageCandidate[] = [];

  for (let i = 0; i < slotCount; i++) {
    const remaining = pool.filter((img) => !used.has(img.url));
    const { candidate, sourceUrl } = await persistFirstAvailableCatalogImage(
      collection,
      slug,
      slotForImageIndex(i),
      remaining
    );
    used.add(sourceUrl);
    results.push(candidate);
  }

  return results;
}

export function slotForImageIndex(index: number): CatalogImageSlot {
  return index === 0 ? "default" : "secondary";
}
