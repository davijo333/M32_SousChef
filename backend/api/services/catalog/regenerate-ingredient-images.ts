import { applySelectedImage } from "@backend/services/catalog/ingredient-enrichment";
import { isValidProductImageUrl } from "@backend/services/catalog/image-selection";
import { ingredientSearchQuery } from "@backend/services/recipes/recipe-build-plan";
import {
  IMAGE_FETCH_POOL_SIZE,
  persistCatalogSlotsFromPool,
  persistFirstAvailableCatalogImage,
  slotForImageIndex,
} from "@backend/services/catalog/persist-catalog-image-candidate";
import type { IIngredient } from "@backend/models/Ingredient";
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
  extraKeywords?: string;
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
      extra_keywords: params.extraKeywords ?? "",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Agent image request failed");
  }
  const data = (await res.json()) as { images?: AgentImageSuggestion[] };
  return (data.images ?? []).filter((img) => img.url && isValidProductImageUrl(img.url));
}

function slotForIndex(index: number) {
  return slotForImageIndex(index);
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

  const searchName = ingredientSearchQuery(ing.name);

  if (mode === "pair") {
    if (existing.length === 1) {
      const fetched = await fetchAgentImages({
        name: searchName,
        brandName: ing.brandName,
        unit: ing.inventoryUnit,
        count: IMAGE_FETCH_POOL_SIZE,
        excludeUrls,
      });
      if (!fetched.length) {
        throw new Error("No suitable product images found");
      }
      const { candidate: replacement } = await persistFirstAvailableCatalogImage(
        "ingredients",
        ing.slug,
        slotForIndex(1),
        fetched
      );
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
      name: searchName,
      brandName: ing.brandName,
      unit: ing.inventoryUnit,
      count: IMAGE_FETCH_POOL_SIZE,
      excludeUrls,
    });
    if (!fetched.length) {
      throw new Error("No suitable product images found");
    }
    const candidates = await persistCatalogSlotsFromPool("ingredients", ing.slug, 2, fetched);
    ing.imageCandidates = candidates;
    ing.selectedImageIndex = 0;
    applySelectedImage(ing);
    await ing.save();
    return ing;
  }

  const secondaryIndex = selected === 0 ? 1 : 0;

  const fetched = await fetchAgentImages({
    name: searchName,
    brandName: ing.brandName,
    unit: ing.inventoryUnit,
    count: IMAGE_FETCH_POOL_SIZE,
    excludeUrls,
  });
  if (!fetched.length) {
    throw new Error("No suitable product images found");
  }
  const { candidate: replacement } = await persistFirstAvailableCatalogImage(
    "ingredients",
    ing.slug,
    slotForIndex(secondaryIndex),
    fetched
  );

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
