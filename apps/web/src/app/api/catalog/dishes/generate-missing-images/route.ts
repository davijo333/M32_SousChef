import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { dishMissingPhotos } from "@/lib/dish-image-status";
import { dishPayload } from "@/lib/dish-payload";
import { regenerateDishImages } from "@/lib/regenerate-dish-images";
import { connectDB } from "@/lib/mongodb";
import { Dish } from "@/models/Dish";

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
      dish.imageGenerationAttempted = true;
      await dish.save();
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
