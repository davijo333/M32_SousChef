import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { ingredientMissingPhotos } from "@/lib/ingredient-image-status";
import { regenerateIngredientImages } from "@/lib/regenerate-ingredient-images";
import { connectDB } from "@/lib/mongodb";
import { Ingredient } from "@/models/Ingredient";

function ingredientPayload(ing: {
  slug: string;
  sku?: string;
  name: string;
  brandName?: string;
  category: string;
  inventoryUnit: string;
  currentQty: number;
  reorderThreshold: number;
  lastPurchasePrice?: number;
  lastOrderedQty?: number;
  imageUrl?: string;
  imageCandidates?: Array<{ url: string; label?: string; source?: string; score?: number }>;
  selectedImageIndex?: number;
  imageGenerationAttempted?: boolean;
}) {
  return {
    slug: ing.slug,
    sku: ing.sku ?? ing.slug,
    name: ing.name,
    brandName: ing.brandName,
    category: ing.category,
    inventoryUnit: ing.inventoryUnit,
    currentQty: ing.currentQty,
    reorderThreshold: ing.reorderThreshold,
    lastPurchasePrice: ing.lastPurchasePrice,
    lastOrderedQty: ing.lastOrderedQty,
    imageUrl: ing.imageUrl,
    imageCandidates: ing.imageCandidates ?? [],
    selectedImageIndex: ing.selectedImageIndex ?? 0,
    imageGenerationAttempted: ing.imageGenerationAttempted ?? false,
  };
}

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
  const ingredients = await Ingredient.find({
    restaurantId,
    imageGenerationAttempted: true,
  });

  const pending = ingredients.filter((ing) => ingredientMissingPhotos(ing));
  let generated = 0;
  let failed = 0;
  const errors: Array<{ slug: string; name: string; error: string }> = [];
  const updated: ReturnType<typeof ingredientPayload>[] = [];

  for (const ing of pending) {
    try {
      const result = await regenerateIngredientImages(ing, "pair");
      updated.push(ingredientPayload(result));
      generated++;
    } catch (err) {
      failed++;
      errors.push({
        slug: ing.slug,
        name: ing.name,
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
    ingredients: updated,
  });
}
