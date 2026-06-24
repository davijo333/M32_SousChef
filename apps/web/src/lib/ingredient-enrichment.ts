import type { PipelineEnrichedRow } from "@/lib/apply-pipeline-enrichment";
import { bestSuggestedImageUrl, isValidProductImageUrl, sortImagesByScore } from "@/lib/image-selection";
import { persistCatalogImage } from "@/lib/r2-storage";
import { buildIngredientSku } from "@/lib/ingredient-sku";
import type { IImageCandidate, IIngredient } from "@/models/Ingredient";
import type { HydratedDocument } from "mongoose";

function normalizeKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Match agent pipeline key — uses raw line name (same as extract-new-items itemId). */
export function enrichmentKeyForRawName(rawName: string): string {
  return `ingredient-${normalizeKey(rawName).replace(/\s+/g, "-")}`;
}

export function buildEnrichmentMap(
  enriched: PipelineEnrichedRow[] | undefined
): Map<string, PipelineEnrichedRow> {
  return new Map((enriched ?? []).map((row) => [row.key, row]));
}

export function lookupLineEnrichment(
  rawName: string,
  map: Map<string, PipelineEnrichedRow>
): PipelineEnrichedRow | undefined {
  return map.get(enrichmentKeyForRawName(rawName));
}

export function extractSkuFromRawName(rawName: string): string | undefined {
  const match = rawName.trim().match(/[#@]\s*(\w+)\s*$/i);
  return match?.[1];
}

function validEnrichmentImages(row: PipelineEnrichedRow | undefined) {
  return sortImagesByScore(
    (row?.images ?? []).filter(
      (img) =>
        img.url &&
        !img.url.includes("placehold.co") &&
        isValidProductImageUrl(img.url)
    )
  ).slice(0, 2);
}

async function persistCandidate(
  ingredientId: string,
  index: number,
  img: { url: string; label?: string; source?: string; score?: number }
): Promise<IImageCandidate> {
  try {
    const stored = await persistCatalogImage(
      "ingredients",
      `${ingredientId}-c${index}`,
      img.url
    );
    return {
      url: stored.publicUrl,
      label: img.label,
      source: img.source,
      score: img.score,
      r2Key: stored.r2Key,
    };
  } catch {
    return {
      url: img.url,
      label: img.label,
      source: img.source,
      score: img.score,
    };
  }
}

function applySelectedImage(ingredient: HydratedDocument<IIngredient>): void {
  const candidates = ingredient.imageCandidates ?? [];
  if (!candidates.length) return;
  const idx = Math.min(
    Math.max(ingredient.selectedImageIndex ?? 0, 0),
    candidates.length - 1
  );
  ingredient.selectedImageIndex = idx;
  const selected = candidates[idx];
  ingredient.imageUrl = selected.url;
  ingredient.imageR2Key = selected.r2Key;
}

/** Attach up to two agent-suggested photos and optional SKU from pipeline enrichment. */
export async function applyIngredientEnrichment(
  ingredient: HydratedDocument<IIngredient>,
  row: PipelineEnrichedRow | undefined,
  rawName?: string
): Promise<void> {
  ingredient.imageGenerationAttempted = true;

  if (row?.brand_name?.trim()) {
    ingredient.brandName = row.brand_name.trim();
  }
  if (row?.normalized_name?.trim()) {
    ingredient.name = row.normalized_name.trim();
  }

  const sku = row?.sku?.trim() || buildIngredientSku({
    brandName: ingredient.brandName,
    name: ingredient.name,
    inventoryUnit: ingredient.inventoryUnit,
    rawName,
  });
  if (!ingredient.sku) ingredient.sku = sku;

  const images = validEnrichmentImages(row);
  if (!images.length) return;

  const existing = ingredient.imageCandidates ?? [];
  const existingUrls = new Set(existing.map((c) => c.url));
  const merged = [...existing];

  for (let i = 0; i < images.length && merged.length < 2; i++) {
    const img = images[i];
    if (existingUrls.has(img.url)) continue;
    const candidate = await persistCandidate(ingredient._id.toString(), merged.length, img);
    merged.push(candidate);
    existingUrls.add(candidate.url);
  }

  if (merged.length) {
    ingredient.imageCandidates = merged.slice(0, 2);
    if (!ingredient.imageUrl) {
      applySelectedImage(ingredient);
    }
  }
}

export async function persistIngredientImageIfMissing(
  ingredient: HydratedDocument<IIngredient>,
  remoteImageUrl: string
): Promise<void> {
  if (!remoteImageUrl.startsWith("http") || ingredient.imageUrl) return;

  try {
    const stored = await persistCatalogImage(
      "ingredients",
      ingredient._id.toString(),
      remoteImageUrl
    );
    ingredient.imageR2Key = stored.r2Key;
    ingredient.imageUrl = stored.publicUrl;
    if (!ingredient.imageCandidates?.length) {
      ingredient.imageCandidates = [
        { url: stored.publicUrl, r2Key: stored.r2Key, source: "bill_upload" },
      ];
      ingredient.selectedImageIndex = 0;
    }
  } catch {
    ingredient.imageUrl = remoteImageUrl;
  }
}

export function bestEnrichmentImageUrl(row: PipelineEnrichedRow | undefined): string {
  if (!row?.images?.length) return "";
  return bestSuggestedImageUrl(row.images);
}

export { applySelectedImage };
