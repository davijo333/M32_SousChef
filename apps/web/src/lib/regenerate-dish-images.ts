import { applySelectedDishImage } from "@/lib/dish-enrichment";
import { isValidProductImageUrl } from "@/lib/image-selection";
import { persistCatalogImageToSlug, type CatalogImageSlot } from "@/lib/r2-storage";
import type { IDish } from "@/models/Dish";
import type { IImageCandidate } from "@/models/Ingredient";
import { Ingredient } from "@/models/Ingredient";
import type { HydratedDocument } from "mongoose";

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";

export type AgentImageSuggestion = {
  url: string;
  label?: string;
  source?: string;
  score?: number;
};

async function resolveDishIngredientNames(
  restaurantId: string,
  links: IDish["ingredientLinks"]
): Promise<string[]> {
  if (!links?.length) return [];
  const slugs = Array.from(new Set(links.map((link) => link.ingredientSlug)));
  const rows = await Ingredient.find({ restaurantId, slug: { $in: slugs } })
    .select("slug name")
    .lean();
  const bySlug = new Map(rows.map((row) => [row.slug, row.name]));
  return slugs
    .map((slug) => bySlug.get(slug))
    .filter((name): name is string => Boolean(name));
}

async function fetchAgentDishImages(params: {
  name: string;
  description?: string;
  ingredientNames?: string[];
  count: number;
  refresh?: boolean;
  excludeUrls?: string[];
}): Promise<AgentImageSuggestion[]> {
  const extraKeywords = params.description?.trim() ?? "";
  const res = await fetch(`${AGENT_URL}/suggest-images`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      item_type: "dish",
      brand_name: "",
      extra_keywords: extraKeywords,
      ingredient_names: params.ingredientNames ?? [],
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
    const stored = await persistCatalogImageToSlug("dishes", slug, slotForIndex(index), img.url);
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

export type DishImageGenOverrides = {
  name?: string;
  description?: string;
  classification?: string;
  ingredientNames?: string[];
  ingredientLinks?: IDish["ingredientLinks"];
};

function dishImageExtraKeywords(
  dish: Pick<IDish, "description" | "classification" | "category">,
  overrides?: DishImageGenOverrides
): string {
  const description = (overrides?.description ?? dish.description ?? "").trim();
  if (description) return description;
  return (overrides?.classification ?? dish.classification ?? dish.category ?? "").trim();
}

function applyDishMetadataOverrides(
  dish: HydratedDocument<IDish>,
  overrides?: DishImageGenOverrides
): void {
  if (!overrides) return;
  if (overrides.name?.trim()) dish.name = overrides.name.trim();
  if (overrides.description !== undefined) {
    dish.description = overrides.description.trim() || undefined;
  }
  if (overrides.classification?.trim()) {
    const classification = overrides.classification.trim();
    dish.classification = classification;
    dish.category = classification;
  }
  if (overrides.ingredientLinks) {
    dish.ingredientLinks = overrides.ingredientLinks;
  }
}

/** Replace non-default slot or create initial pair. Mutates and saves dish. */
export async function regenerateDishImages(
  dish: HydratedDocument<IDish>,
  mode: "pair" | "secondary",
  selectedImageIndex?: number,
  overrides?: DishImageGenOverrides
): Promise<HydratedDocument<IDish>> {
  applyDishMetadataOverrides(dish, overrides);
  dish.imageGenerationAttempted = true;

  const imageName = overrides?.name?.trim() || dish.name;
  const imageDescription = dishImageExtraKeywords(dish, overrides);
  const ingredientNames =
    overrides?.ingredientNames?.length
      ? overrides.ingredientNames
      : await resolveDishIngredientNames(dish.restaurantId.toString(), dish.ingredientLinks);

  const fetchParams = {
    name: imageName,
    description: imageDescription,
    ingredientNames,
  };

  const existing = dish.imageCandidates ?? [];
  const slotCount = Math.max(existing.length, 2);
  const selected = Math.min(
    Math.max(selectedImageIndex ?? dish.selectedImageIndex ?? 0, 0),
    slotCount - 1
  );
  dish.selectedImageIndex = selected;

  const excludeUrls = [
    ...existing.map((c) => c.url),
    ...(dish.imageUrl ? [dish.imageUrl] : []),
  ];

  if (mode === "pair") {
    if (existing.length === 1) {
      const fetched = await fetchAgentDishImages({ ...fetchParams, count: 1, excludeUrls });
      if (!fetched.length) throw new Error("No suitable dish images found");
      const replacement = await persistCandidate(dish.slug, 1, fetched[0]);
      const next = [...existing];
      if (selected === 0) next.push(replacement);
      else {
        next.unshift(replacement);
        dish.selectedImageIndex = 1;
      }
      dish.imageCandidates = next.slice(0, 2);
      applySelectedDishImage(dish);
      await dish.save();
      return dish;
    }

    const fetched = await fetchAgentDishImages({ ...fetchParams, count: 2, excludeUrls });
    if (!fetched.length) throw new Error("No suitable dish images found");
    const candidates: IImageCandidate[] = [];
    for (let i = 0; i < Math.min(2, fetched.length); i++) {
      candidates.push(await persistCandidate(dish.slug, i, fetched[i]));
    }
    dish.imageCandidates = candidates;
    dish.selectedImageIndex = 0;
    applySelectedDishImage(dish);
    await dish.save();
    return dish;
  }

  const secondaryIndex = selected === 0 ? 1 : 0;
  const fetched = await fetchAgentDishImages({ ...fetchParams, count: 1, excludeUrls });
  if (!fetched.length) throw new Error("No suitable dish images found");
  const replacement = await persistCandidate(dish.slug, secondaryIndex, fetched[0]);

  const next = [...existing];
  if (next.length === 0) {
    next.push(replacement);
    dish.selectedImageIndex = 0;
  } else if (next.length === 1) {
    if (selected === 0) next.push(replacement);
    else {
      next.unshift(replacement);
      dish.selectedImageIndex = 1;
    }
  } else {
    next[secondaryIndex] = replacement;
    dish.selectedImageIndex = selected;
  }

  dish.imageCandidates = next.slice(0, 2);
  applySelectedDishImage(dish);
  await dish.save();
  return dish;
}
