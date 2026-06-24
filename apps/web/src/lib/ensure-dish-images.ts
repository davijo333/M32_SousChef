import { dishMissingPhotos } from "@/lib/dish-image-status";
import { regenerateDishImages } from "@/lib/regenerate-dish-images";
import { Dish } from "@/models/Dish";

export type EnsureDishImagesResult = {
  attempted: number;
  generated: number;
  failed: number;
};

/** Generate default + secondary photos for dishes that are missing images. */
export async function ensureDishImages(
  restaurantId: string,
  slugs?: string[]
): Promise<EnsureDishImagesResult> {
  const query: Record<string, unknown> = { restaurantId };
  if (slugs?.length) query.slug = { $in: slugs };

  const dishes = await Dish.find(query);
  const pending = dishes.filter(
    (dish) => !dish.imageGenerationAttempted || dishMissingPhotos(dish)
  );

  let generated = 0;
  let failed = 0;

  for (const dish of pending) {
    try {
      await regenerateDishImages(dish, "pair");
      generated += 1;
    } catch {
      dish.imageGenerationAttempted = true;
      await dish.save();
      failed += 1;
    }
  }

  return { attempted: pending.length, generated, failed };
}
