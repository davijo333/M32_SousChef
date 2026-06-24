import { isValidProductImageUrl } from "@/lib/image-selection";

type ImageLike = { url?: string };

export function validIngredientImageCount(
  imageCandidates?: ImageLike[],
  imageUrl?: string
): number {
  const fromCandidates = (imageCandidates ?? []).filter((c) =>
    isValidProductImageUrl(c.url ?? "")
  );
  if (fromCandidates.length >= 2) return 2;
  if (fromCandidates.length === 1) return 1;
  if (imageUrl && isValidProductImageUrl(imageUrl)) return 1;
  return 0;
}

/** True when default + secondary are not both present. */
export function ingredientMissingPhotos(ing: {
  imageUrl?: string;
  imageCandidates?: ImageLike[];
}): boolean {
  return validIngredientImageCount(ing.imageCandidates, ing.imageUrl) < 2;
}
