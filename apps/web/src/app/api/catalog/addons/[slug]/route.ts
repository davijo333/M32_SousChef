import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { applySelectedAddOnImage } from "@/lib/dish-enrichment";
import { normalizeIngredientLinks } from "@/lib/dish-payload";
import { refreshIngredientLabels } from "@/lib/ingredient-labels";
import { scheduleRecipeBuild } from "@/lib/recipe-builder";
import { connectDB } from "@/lib/mongodb";
import { AddOn } from "@/models/AddOn";
import { Recipe } from "@/models/Recipe";

type RouteContext = { params: Promise<{ slug: string }> };

export async function PATCH(req: Request, context: RouteContext) {
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

  await connectDB();
  const addOn = await AddOn.findOne({ restaurantId, slug });
  if (!addOn) {
    return NextResponse.json({ error: "Add-on not found" }, { status: 404 });
  }

  if (body.name != null) addOn.name = String(body.name).trim() || addOn.name;
  if (body.classification != null) {
    addOn.classification = String(body.classification).trim() || addOn.classification || "addon";
  }
  if (body.description !== undefined) {
    addOn.description = body.description == null ? undefined : String(body.description);
  }
  if (body.sellPrice != null) {
    addOn.sellPrice = Number(body.sellPrice);
  }
  if (body.selectedImageIndex != null) {
    const idx = Number(body.selectedImageIndex);
    if (!Number.isNaN(idx)) addOn.selectedImageIndex = idx;
  }
  if (body.linkedDishSlugs != null) {
    addOn.linkedDishSlugs = Array.isArray(body.linkedDishSlugs)
      ? body.linkedDishSlugs.map((s: unknown) => String(s).trim()).filter(Boolean)
      : [];
  }
  if (body.ingredientLinks != null) {
    addOn.ingredientLinks = normalizeIngredientLinks(body.ingredientLinks);
  }

  applySelectedAddOnImage(addOn);
  await addOn.save();
  if (body.ingredientLinks != null) {
    await refreshIngredientLabels(restaurantId);
    if (addOn.ingredientLinks.length > 0) {
      scheduleRecipeBuild(restaurantId, "addon", slug);
    }
  }

  return NextResponse.json({
    ok: true,
    addOn: {
      slug: addOn.slug,
      name: addOn.name,
      classification: addOn.classification ?? "addon",
      description: addOn.description,
      sellPrice: addOn.sellPrice,
      linkedDishSlugs: addOn.linkedDishSlugs ?? [],
      ingredientLinks: addOn.ingredientLinks ?? [],
      imageUrl: addOn.imageUrl,
      imageCandidates: addOn.imageCandidates ?? [],
      selectedImageIndex: addOn.selectedImageIndex ?? 0,
      imageGenerationAttempted: addOn.imageGenerationAttempted ?? false,
    },
  });
}

export async function DELETE(_req: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = (session.user as { restaurantId?: string }).restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "No restaurant" }, { status: 400 });
  }

  const { slug } = await context.params;

  await connectDB();
  const deleted = await AddOn.findOneAndDelete({ restaurantId, slug });
  if (!deleted) {
    return NextResponse.json({ error: "Add-on not found" }, { status: 404 });
  }

  await refreshIngredientLabels(restaurantId);

  return NextResponse.json({ ok: true, slug });
}
