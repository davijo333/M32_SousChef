import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@backend/services/infra/auth";
import { dishMissingPhotos } from "@backend/services/catalog/dish-image-status";
import { dishPayload } from "@backend/services/catalog/dish-payload";
import { regenerateDishImages } from "@backend/services/catalog/regenerate-dish-images";
import { connectDB } from "@backend/services/infra/mongodb";
import { Dish } from "@backend/models/Dish";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = (session.user as { restaurantId?: string }).restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "No restaurant" }, { status: 400 });
  }

  await connectDB();
  const dishes = await Dish.find({ restaurantId });
  const pending = dishes.filter((dish) => dishMissingPhotos(dish));

  let generated = 0;
  let failed = 0;
  const errors: Array<{ slug: string; name: string; error: string }> = [];
  const updated: ReturnType<typeof dishPayload>[] = [];

  for (const dish of pending) {
    try {
      const result = await regenerateDishImages(dish, "pair");
      updated.push(dishPayload(result));
      generated++;
    } catch (err) {
      failed++;
      await Dish.updateOne({ _id: dish._id }, { $set: { imageGenerationAttempted: true } });
      errors.push({
        slug: dish.slug,
        name: dish.name,
        error: err instanceof Error ? err.message : "Image generation failed",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    attempted: pending.length,
    generated,
    failed,
    errors,
    dishes: updated,
  });
}
