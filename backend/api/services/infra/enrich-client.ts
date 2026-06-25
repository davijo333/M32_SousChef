import type { NewCatalogItem } from "@backend/services/catalog/extract-new-items";
import { isItemReadyForCard } from "@backend/services/catalog/image-selection";

type PreparedBatch = { ingredients: NewCatalogItem[]; dishes: NewCatalogItem[] };

/** One batch call: images for review cards (recipe links optional, via Kitchen later). */
export async function prepareNewItemsForReview(
  ingredients: NewCatalogItem[],
  dishes: NewCatalogItem[],
  phase: "supplier" | "customer",
  onReady: (batch: PreparedBatch) => void,
  onDone?: () => void
) {
  const queueIng = ingredients.filter((i) => !isItemReadyForCard(i));
  const queueDish = dishes.filter((i) => !isItemReadyForCard(i));
  if (!queueIng.length && !queueDish.length) {
    onDone?.();
    return;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180_000);
    const res = await fetch("/api/catalog/prepare-new-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phase,
        ingredients: queueIng,
        dishes: queueDish,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      onReady({
        ingredients: queueIng.map((i) => ({ ...i, imagesLoading: false })),
        dishes: queueDish.map((i) => ({ ...i, imagesLoading: false })),
      });
      return;
    }

    const data = (await res.json()) as PreparedBatch;
    onReady({
      ingredients: (data.ingredients ?? queueIng).map((i) => ({ ...i, imagesLoading: false })),
      dishes: (data.dishes ?? queueDish).map((i) => ({ ...i, imagesLoading: false })),
    });
  } catch {
    onReady({
      ingredients: queueIng.map((i) => ({ ...i, imagesLoading: false })),
      dishes: queueDish.map((i) => ({ ...i, imagesLoading: false })),
    });
  } finally {
    onDone?.();
  }
}
