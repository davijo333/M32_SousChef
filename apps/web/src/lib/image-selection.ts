import type { ImageSuggestion, NewCatalogItem } from "@/lib/extract-new-items";

export const REQUIRED_CARD_IMAGES = 2;

export function isValidProductImageUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("/api/r2/")) return true;
  if (!url.startsWith("http")) return false;
  const lower = url.toLowerCase().split("?")[0];
  const blocked = [".gif", "giphy.com", "tenor.com", "imgflip.com", "/meme", "meme."];
  return !blocked.some((b) => lower.includes(b));
}

export function sortImagesByScore(images: ImageSuggestion[]): ImageSuggestion[] {
  return [...images].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

export function bestSuggestedImageUrl(images: ImageSuggestion[]): string {
  const sorted = sortImagesByScore(
    images.filter((img) => img.url && !img.url.includes("placehold.co"))
  );
  return sorted[0]?.url ?? "";
}

/** Valid product-photo URLs attached to a review card (excludes placeholders). */
export function validImageSuggestions(item: NewCatalogItem): ImageSuggestion[] {
  return sortImagesByScore(
    item.imageSuggestions.filter(
      (img) => img.url && !img.url.includes("placehold.co") && isValidProductImageUrl(img.url)
    )
  );
}

export function countValidImages(item: NewCatalogItem): number {
  return validImageSuggestions(item).length;
}

/** Card appears once enrichment finished and at least one photo is available (agent targets 2). */
export function isItemReadyForCard(item: NewCatalogItem): boolean {
  if (item.imagesLoading) return false;
  return countValidImages(item) >= 1;
}

/** Image URL to show/save — manual pick wins over bulk suggested default. */
export function resolveItemImageUrl(item: NewCatalogItem): string {
  if (item.imageSelectionManual && item.selectedImageUrl) {
    return item.selectedImageUrl;
  }
  if (item.selectedImageUrl) {
    return item.selectedImageUrl;
  }
  return bestSuggestedImageUrl(item.imageSuggestions);
}

export function applySuggestedImages(items: NewCatalogItem[]): NewCatalogItem[] {
  return items.map((item) => {
    if (item.imageSelectionManual) return item;
    const url = bestSuggestedImageUrl(item.imageSuggestions);
    if (!url) return item;
    return { ...item, selectedImageUrl: url };
  });
}

export function countSuggestedAssignable(items: NewCatalogItem[]): number {
  return items.filter(
    (item) =>
      !item.imageSelectionManual &&
      item.imageSuggestions.some((img) => img.url && !img.url.includes("placehold.co"))
  ).length;
}

export function initialModalImageUrl(item: NewCatalogItem, images: ImageSuggestion[]): string {
  if (item.imageSelectionManual && item.selectedImageUrl) {
    return item.selectedImageUrl;
  }
  if (item.selectedImageUrl) {
    return item.selectedImageUrl;
  }
  return bestSuggestedImageUrl(images);
}
