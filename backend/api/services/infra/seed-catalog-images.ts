import {
  findSlugCatalogImage,
  type CatalogCollection,
  type CatalogImageSlot,
} from "@backend/services/infra/r2-storage";
import type { IImageCandidate } from "@backend/models/Ingredient";

const SLOTS: CatalogImageSlot[] = ["default", "secondary"];

export async function loadSlugImageCandidates(
  collection: CatalogCollection,
  slug: string
): Promise<IImageCandidate[]> {
  const candidates: IImageCandidate[] = [];
  for (const slot of SLOTS) {
    const found = await findSlugCatalogImage(collection, slug, slot);
    if (!found) continue;
    candidates.push({
      url: found.publicUrl,
      label: slot === "default" ? "Default" : "Secondary",
      source: "seed",
      r2Key: found.r2Key,
    });
  }
  return candidates;
}

type ImageAttachable = {
  slug: string;
  imageUrl?: string;
  imageR2Key?: string;
  imageCandidates?: IImageCandidate[];
  selectedImageIndex?: number;
  imageGenerationAttempted?: boolean;
};

/** Attach pre-stored slug images from storage/r2 if present. Returns true when any image was linked. */
export async function attachSeedCatalogImages(
  doc: ImageAttachable,
  collection: CatalogCollection
): Promise<boolean> {
  const candidates = await loadSlugImageCandidates(collection, doc.slug);
  if (!candidates.length) return false;

  doc.imageCandidates = candidates;
  doc.selectedImageIndex = 0;
  doc.imageUrl = candidates[0].url;
  doc.imageR2Key = candidates[0].r2Key;
  doc.imageGenerationAttempted = true;
  return true;
}
