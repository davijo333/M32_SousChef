import type { IImageCandidate } from "@backend/models/Ingredient";
import type { IDish } from "@backend/models/Dish";
import type { IAddOn } from "@backend/models/AddOn";
import type { HydratedDocument } from "mongoose";

export function applySelectedDishImage(dish: HydratedDocument<IDish>): void {
  const candidates = dish.imageCandidates ?? [];
  if (!candidates.length) return;
  const idx = Math.min(Math.max(dish.selectedImageIndex ?? 0, 0), candidates.length - 1);
  dish.selectedImageIndex = idx;
  const selected = candidates[idx];
  dish.imageUrl = selected.url;
  dish.imageR2Key = selected.r2Key;
}

export type DishImageFields = {
  imageUrl?: string;
  imageR2Key?: string;
  imageCandidates?: IImageCandidate[];
  selectedImageIndex?: number;
  imageGenerationAttempted?: boolean;
};

export function applySelectedAddOnImage(addOn: HydratedDocument<IAddOn>): void {
  const candidates = addOn.imageCandidates ?? [];
  if (!candidates.length) return;
  const idx = Math.min(Math.max(addOn.selectedImageIndex ?? 0, 0), candidates.length - 1);
  addOn.selectedImageIndex = idx;
  const selected = candidates[idx];
  addOn.imageUrl = selected.url;
  addOn.imageR2Key = selected.r2Key;
}
