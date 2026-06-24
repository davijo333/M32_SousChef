import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { dishMissingPhotos } from "@/lib/dish-image-status";
import { regenerateAddOnImages } from "@/lib/regenerate-addon-images";
import { connectDB } from "@/lib/mongodb";
import { AddOn } from "@/models/AddOn";

function addOnPayload(addOn: {
  slug: string;
  name: string;
  classification?: string;
  description?: string;
  sellPrice: number;
  imageUrl?: string;
  imageCandidates?: Array<{ url: string; label?: string; source?: string; score?: number }>;
  selectedImageIndex?: number;
  imageGenerationAttempted?: boolean;
  linkedDishSlugs?: string[];
  ingredientLinks?: Array<{
    ingredientSlug: string;
    qtyPerServing: number;
    unit: string;
  }>;
}) {
  return {
    slug: addOn.slug,
    name: addOn.name,
    classification: addOn.classification ?? "addon",
    description: addOn.description,
    sellPrice: addOn.sellPrice,
    imageUrl: addOn.imageUrl,
    imageCandidates: addOn.imageCandidates ?? [],
    selectedImageIndex: addOn.selectedImageIndex ?? 0,
    imageGenerationAttempted: addOn.imageGenerationAttempted ?? false,
    linkedDishSlugs: addOn.linkedDishSlugs ?? [],
    ingredientLinks: addOn.ingredientLinks ?? [],
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
  const addOns = await AddOn.find({ restaurantId });
  const pending = addOns.filter((addOn) => dishMissingPhotos(addOn));

  let generated = 0;
  let failed = 0;
  const errors: Array<{ slug: string; name: string; error: string }> = [];
  const updated: ReturnType<typeof addOnPayload>[] = [];

  for (const addOn of pending) {
    try {
      const result = await regenerateAddOnImages(addOn, "pair");
      updated.push(addOnPayload(result));
      generated++;
    } catch (err) {
      failed++;
      addOn.imageGenerationAttempted = true;
      await addOn.save();
      errors.push({
        slug: addOn.slug,
        name: addOn.name,
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
    addOns: updated,
  });
}
