import mongoose from "mongoose";
import { Restaurant } from "@/models/Restaurant";

export async function beginRecipeAgentWork(restaurantId: string): Promise<void> {
  await Restaurant.findByIdAndUpdate(new mongoose.Types.ObjectId(restaurantId), {
    $inc: { recipeAgentWorkCount: 1 },
    $set: { recipeAgentCooking: true },
  });
}

export async function endRecipeAgentWork(restaurantId: string): Promise<void> {
  const doc = await Restaurant.findByIdAndUpdate(
    new mongoose.Types.ObjectId(restaurantId),
    { $inc: { recipeAgentWorkCount: -1 } },
    { new: true }
  ).lean();

  if (!doc || (doc.recipeAgentWorkCount ?? 0) <= 0) {
    await Restaurant.findByIdAndUpdate(new mongoose.Types.ObjectId(restaurantId), {
      $set: { recipeAgentCooking: false, recipeAgentWorkCount: 0 },
    });
  }
}

export async function isRecipeAgentCooking(restaurantId: string): Promise<boolean> {
  const doc = await Restaurant.findById(new mongoose.Types.ObjectId(restaurantId))
    .select("recipeAgentCooking")
    .lean();
  return Boolean(doc?.recipeAgentCooking);
}
