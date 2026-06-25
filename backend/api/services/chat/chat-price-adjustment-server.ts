import { connectDB } from "@backend/services/infra/mongodb";
import { Recipe } from "@backend/models/Recipe";
import { findDishByNameQuery } from "@backend/services/catalog/dish-lookup";
import type {
  PriceAdjustmentRequest,
  ResolvedSellPrice,
} from "@backend/services/chat/chat-price-adjustment";

export async function resolveSellPriceForAdjustment(
  restaurantId: string,
  dishName: string,
  adjustment: PriceAdjustmentRequest
): Promise<ResolvedSellPrice | null> {
  await connectDB();
  const dish = await findDishByNameQuery(restaurantId, dishName);
  if (!dish) return null;

  const recipe = await Recipe.findOne({
    restaurantId,
    kind: "dish",
    targetSlug: dish.slug,
  })
    .select("foodCost sellPrice")
    .lean();

  const foodCost = Number(recipe?.foodCost ?? 0);
  let sellPrice: number;
  if (adjustment.mode === "margin") {
    if (foodCost <= 0) return null;
    sellPrice = Math.round((foodCost + adjustment.targetMargin) * 100) / 100;
  } else {
    sellPrice = adjustment.sellPrice;
  }

  return {
    slug: dish.slug,
    name: dish.name,
    sellPrice,
    foodCost,
  };
}
