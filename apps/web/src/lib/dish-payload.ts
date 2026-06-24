import type { IIngredientLink, RecipeStatus } from "@/models/Dish";

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
  imageCandidates?: Array<{ url: string; label?: string; source?: string; score?: number }>;
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
}): DishDetail {
  return {
    slug: dish.slug,
    name: dish.name,
    category: dish.category,
    classification: dish.classification ?? dish.category,
    sellPrice: dish.sellPrice,
    totalSold: dish.totalSold ?? 0,
    recipeStatus: dish.recipeStatus,
    description: dish.description,
    imageUrl: dish.imageUrl,
    imageCandidates: dish.imageCandidates ?? [],
    selectedImageIndex: dish.selectedImageIndex ?? 0,
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
