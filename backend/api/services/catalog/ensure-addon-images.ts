import { dishMissingPhotos } from "@backend/services/catalog/dish-image-status";
import { regenerateAddOnImages } from "@backend/services/catalog/regenerate-addon-images";
import { AddOn } from "@backend/models/AddOn";

export type EnsureAddOnImagesResult = {
  attempted: number;
  generated: number;
  failed: number;
};

/** Generate default + secondary photos for add-ons that are missing images. */
export async function ensureAddOnImages(
  restaurantId: string,
  slugs?: string[]
): Promise<EnsureAddOnImagesResult> {
  const query: Record<string, unknown> = { restaurantId };
  if (slugs?.length) query.slug = { $in: slugs };

  const addOns = await AddOn.find(query);
  const pending = addOns.filter(
    (addOn) => !addOn.imageGenerationAttempted || dishMissingPhotos(addOn)
  );

  let generated = 0;
  let failed = 0;

  for (const addOn of pending) {
    try {
      await regenerateAddOnImages(addOn, "pair");
      generated += 1;
    } catch {
      addOn.imageGenerationAttempted = true;
      await addOn.save();
      failed += 1;
    }
  }

  return { attempted: pending.length, generated, failed };
}
