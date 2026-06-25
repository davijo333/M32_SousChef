import type { IIngredientLink, RecipeStatus } from "@backend/models/Dish";

import { isUsableImageCandidate } from "@backend/services/catalog/image-selection";

export type DishIngredientLink = {
  ingredientSlug: string;
  qtyPerServing: number;
  unit: string;
  scalesWithSize?: boolean;
  notes?: string;
};

export type DishDetail = {
  slug: string;
  name: string;
  category: string;
  classification?: string;
  sellPrice: number;
  totalSold: number;
  recipeStatus?: RecipeStatus;
  description?: string;
  imageUrl?: string;
  imageCandidates?: Array<{
    url: string;
    label?: string;
    source?: string;
    score?: number;
    r2Key?: string;
  }>;
  selectedImageIndex?: number;
  imageGenerationAttempted?: boolean;
  ingredientLinks?: DishIngredientLink[];
  linkedAddOnSlugs?: string[];
  isNew?: boolean;
};

export function normalizeIngredientLinks(links: unknown): IIngredientLink[] {
  if (!Array.isArray(links)) return [];
  const normalized: IIngredientLink[] = [];
  for (const link of links) {
    const ingredientSlug = String(link?.ingredientSlug ?? "").trim();
    if (!ingredientSlug) continue;
    const qtyPerServing = Number(link?.qtyPerServing);
    normalized.push({
      ingredientSlug,
      qtyPerServing: Number.isFinite(qtyPerServing) && qtyPerServing > 0 ? qtyPerServing : 1,
      unit: String(link?.unit ?? "each").trim() || "each",
      scalesWithSize: link?.scalesWithSize !== false,
      notes: link?.notes ? String(link.notes).trim() : undefined,
    });
  }
  return normalized;
}

export function dishPayload(dish: {
  slug: string;
  name: string;
  category: string;
  classification?: string;
  sellPrice: number;
  totalSold?: number;
  recipeStatus?: RecipeStatus;
  description?: string;
  imageUrl?: string;
  imageCandidates?: DishDetail["imageCandidates"];
  selectedImageIndex?: number;
  imageGenerationAttempted?: boolean;
  ingredientLinks?: IIngredientLink[];
  imageR2Key?: string;
}): DishDetail {
  const usableCandidates = (dish.imageCandidates ?? []).filter((c) => isUsableImageCandidate(c));
  const selectedIndex = Math.min(
    Math.max(dish.selectedImageIndex ?? 0, 0),
    Math.max(usableCandidates.length - 1, 0)
  );
  const primary = usableCandidates[selectedIndex];
  const imageUrl =
    primary?.url && isUsableImageCandidate(primary)
      ? primary.url
      : dish.imageUrl && isUsableImageCandidate({ url: dish.imageUrl, r2Key: dish.imageR2Key })
        ? dish.imageUrl
        : undefined;

  return {
    slug: dish.slug,
    name: dish.name,
    category: dish.category,
    classification: dish.classification ?? dish.category,
    sellPrice: dish.sellPrice,
    totalSold: dish.totalSold ?? 0,
    recipeStatus: dish.recipeStatus,
    description: dish.description,
    imageUrl,
    imageCandidates: usableCandidates,
    selectedImageIndex: usableCandidates.length ? selectedIndex : 0,
    imageGenerationAttempted: dish.imageGenerationAttempted ?? false,
    ingredientLinks: (dish.ingredientLinks ?? []).map((link) => ({
      ingredientSlug: link.ingredientSlug,
      qtyPerServing: link.qtyPerServing,
      unit: link.unit,
      scalesWithSize: link.scalesWithSize ?? true,
      notes: link.notes,
    })),
  };
}
