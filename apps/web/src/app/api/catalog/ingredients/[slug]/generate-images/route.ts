import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@backend/services/infra/auth";
import { regenerateIngredientImages } from "@backend/services/catalog/regenerate-ingredient-images";
import { connectDB } from "@backend/services/infra/mongodb";
import { Ingredient } from "@backend/models/Ingredient";

type RouteContext = { params: Promise<{ slug: string }> };

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

export async function POST(req: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = (session.user as { restaurantId?: string }).restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "No restaurant" }, { status: 400 });
  }

  const { slug } = await context.params;
  const body = await req.json();
  const mode = body.mode === "pair" ? "pair" : "secondary";
  const selectedImageIndex =
    body.selectedImageIndex != null ? Number(body.selectedImageIndex) : undefined;

  await connectDB();
  const ing = await Ingredient.findOne({ restaurantId, slug });
  if (!ing) {
    return NextResponse.json({ error: "Ingredient not found" }, { status: 404 });
  }

  try {
    const updated = await regenerateIngredientImages(
      ing,
      mode,
      Number.isNaN(selectedImageIndex) ? undefined : selectedImageIndex
    );
    return NextResponse.json({ ok: true, ingredient: ingredientPayload(updated) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Image generation failed";
    if (message.includes("Agent") || message.includes("fetch")) {
      return NextResponse.json(
        { error: "Image agent unavailable. Run: npm run start:agents" },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
