import { isUsableImageCandidate } from "@/lib/image-selection";

type ImageLike = { url?: string; r2Key?: string };

export function validDishImageCount(
  imageCandidates?: ImageLike[],
  imageUrl?: string
): number {
  const fromCandidates = (imageCandidates ?? []).filter((c) => isUsableImageCandidate(c));
  if (fromCandidates.length >= 2) return 2;
  if (fromCandidates.length === 1) return 1;
  if (imageUrl && isUsableImageCandidate({ url: imageUrl })) return 1;
  return 0;
}

export function dishMissingPhotos(dish: {
  imageUrl?: string;
  imageCandidates?: ImageLike[];
}): boolean {
  return validDishImageCount(dish.imageCandidates, dish.imageUrl) < 2;
}
