import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { reconcileKitchenInventory } from "@/lib/kitchen-inventory";
import { connectDB } from "@/lib/mongodb";
import { Ingredient } from "@/models/Ingredient";
import { Restaurant } from "@/models/Restaurant";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = (session.user as { restaurantId?: string }).restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "No restaurant" }, { status: 400 });
  }

  await connectDB();
  await reconcileKitchenInventory(restaurantId);

  // Legacy rows ingested before imageGenerationAttempted existed
  await Ingredient.updateMany(
    { restaurantId, source: "bill_upload", imageGenerationAttempted: { $ne: true } },
    { $set: { imageGenerationAttempted: true } }
  );

  const [restaurant, ingredients] = await Promise.all([
    Restaurant.findById(restaurantId).lean(),
    Ingredient.find({ restaurantId, imageGenerationAttempted: true }).sort({ name: 1 }).lean(),
  ]);

  return NextResponse.json({
    restaurant: restaurant
      ? { name: restaurant.name, isSeeded: restaurant.isSeeded }
      : { name: "Your kitchen", isSeeded: false },
    ingredients: ingredients.map((i) => ({
      slug: i.slug,
      sku: i.sku ?? i.slug,
      name: i.name,
      category: i.category,
      inventoryUnit: i.inventoryUnit,
      currentQty: i.currentQty,
      reorderThreshold: i.reorderThreshold,
      lastPurchasePrice: i.lastPurchasePrice,
      lastOrderedQty: i.lastOrderedQty,
      imageUrl: i.imageUrl,
      imageCandidates: i.imageCandidates ?? [],
      selectedImageIndex: i.selectedImageIndex ?? 0,
      imageGenerationAttempted: i.imageGenerationAttempted ?? false,
      brandName: i.brandName,
    })),
  });
}
