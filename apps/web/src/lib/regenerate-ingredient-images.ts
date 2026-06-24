import { applySelectedImage } from "@/lib/ingredient-enrichment";
import { isValidProductImageUrl } from "@/lib/image-selection";
import { persistCatalogImageToSlug, type CatalogImageSlot } from "@/lib/r2-storage";
import type { IImageCandidate, IIngredient } from "@/models/Ingredient";
import type { HydratedDocument } from "mongoose";

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";

export type AgentImageSuggestion = {
  url: string;
  label?: string;
  source?: string;
  score?: number;
};

export async function fetchAgentImages(params: {
  name: string;
  brandName?: string;
  unit?: string;
  count: number;
  refresh?: boolean;
  excludeUrls?: string[];
}): Promise<AgentImageSuggestion[]> {
  const res = await fetch(`${AGENT_URL}/suggest-images`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      item_type: "ingredient",
      brand_name: params.brandName ?? "",
      unit: params.unit ?? "",
      count: params.count,
      refresh: params.refresh ?? true,
      exclude_urls: params.excludeUrls ?? [],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Agent image request failed");
  }
  const data = (await res.json()) as { images?: AgentImageSuggestion[] };
  return (data.images ?? []).filter((img) => img.url && isValidProductImageUrl(img.url));
}

function slotForIndex(index: number): CatalogImageSlot {
  return index === 0 ? "default" : "secondary";
}

async function persistCandidate(
  slug: string,
  index: number,
  img: AgentImageSuggestion
): Promise<IImageCandidate> {
  try {
    const stored = await persistCatalogImageToSlug(
      "ingredients",
      slug,
      slotForIndex(index),
      img.url
    );
    return {
      url: stored.publicUrl,
      label: img.label,
      source: img.source ?? "regenerated",
      score: img.score,
      r2Key: stored.r2Key,
    };
  } catch {
    return {
      url: img.url,
      label: img.label,
      source: img.source ?? "regenerated",
      score: img.score,
    };
  }
}

/** Replace non-default slot or create initial pair. Mutates and saves ingredient. */
export async function regenerateIngredientImages(
  ing: HydratedDocument<IIngredient>,
  mode: "pair" | "secondary",
  selectedImageIndex?: number
): Promise<HydratedDocument<IIngredient>> {
  ing.imageGenerationAttempted = true;

  const existing = ing.imageCandidates ?? [];
  const slotCount = Math.max(existing.length, 2);
  const selected = Math.min(
    Math.max(selectedImageIndex ?? ing.selectedImageIndex ?? 0, 0),
    slotCount - 1
  );
  ing.selectedImageIndex = selected;

  const excludeUrls = [
    ...existing.map((c) => c.url),
    ...(ing.imageUrl ? [ing.imageUrl] : []),
  ];

  if (mode === "pair") {
    if (existing.length === 1) {
      const fetched = await fetchAgentImages({
        name: ing.name,
        brandName: ing.brandName,
        unit: ing.inventoryUnit,
        count: 1,
        excludeUrls,
      });
      if (!fetched.length) {
        throw new Error("No suitable product images found");
      }
      const replacement = await persistCandidate(ing.slug, 1, fetched[0]);
      const next = [...existing];
      if (selected === 0) next.push(replacement);
      else {
        next.unshift(replacement);
        ing.selectedImageIndex = 1;
      }
      ing.imageCandidates = next.slice(0, 2);
      applySelectedImage(ing);
      await ing.save();
      return ing;
    }

    const fetched = await fetchAgentImages({
      name: ing.name,
      brandName: ing.brandName,
      unit: ing.inventoryUnit,
      count: 2,
      excludeUrls,
    });
    if (!fetched.length) {
      throw new Error("No suitable product images found");
    }
    const candidates: IImageCandidate[] = [];
    for (let i = 0; i < Math.min(2, fetched.length); i++) {
      candidates.push(await persistCandidate(ing.slug, i, fetched[i]));
    }
    ing.imageCandidates = candidates;
    ing.selectedImageIndex = 0;
    applySelectedImage(ing);
    await ing.save();
    return ing;
  }

  const secondaryIndex = selected === 0 ? 1 : 0;

  const fetched = await fetchAgentImages({
    name: ing.name,
    brandName: ing.brandName,
    unit: ing.inventoryUnit,
    count: 1,
    excludeUrls,
  });
  if (!fetched.length) {
    throw new Error("No suitable product images found");
  }
  const replacement = await persistCandidate(ing.slug, secondaryIndex, fetched[0]);

  const next = [...existing];
  if (next.length === 0) {
    next.push(replacement);
    ing.selectedImageIndex = 0;
  } else if (next.length === 1) {
    if (selected === 0) next.push(replacement);
    else {
      next.unshift(replacement);
      ing.selectedImageIndex = 1;
    }
  } else {
    next[secondaryIndex] = replacement;
    ing.selectedImageIndex = selected;
  }

  ing.imageCandidates = next.slice(0, 2);
  applySelectedImage(ing);
  await ing.save();
  return ing;
}
