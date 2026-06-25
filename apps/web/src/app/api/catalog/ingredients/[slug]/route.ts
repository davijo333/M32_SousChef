import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@backend/services/infra/auth";
import { applySelectedImage } from "@backend/services/catalog/ingredient-enrichment";
import { refreshIngredientLabels } from "@backend/services/catalog/ingredient-labels";
import { connectDB } from "@backend/services/infra/mongodb";
import { AddOn } from "@backend/models/AddOn";
import { Dish } from "@backend/models/Dish";
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

export async function GET(_req: Request, context: RouteContext) {
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

  const ing = await Ingredient.findOne({ restaurantId, slug }).lean();
  if (!ing) {
    return NextResponse.json({ error: "Ingredient not found" }, { status: 404 });
  }

  return NextResponse.json({ ingredient: ingredientPayload(ing) });
}

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
  const ing = await Ingredient.findOne({ restaurantId, slug });
  if (!ing) {
    return NextResponse.json({ error: "Ingredient not found" }, { status: 404 });
  }

  if (body.name != null) ing.name = String(body.name).trim() || ing.name;
  if (body.category != null) ing.category = String(body.category).trim() || ing.category;
  if (body.brandName != null) ing.brandName = String(body.brandName).trim() || undefined;
  if (body.sku != null) ing.sku = String(body.sku).trim() || undefined;
  if (body.currentQty != null) ing.currentQty = Number(body.currentQty);
  if (body.reorderThreshold != null) ing.reorderThreshold = Number(body.reorderThreshold);
  if (body.lastPurchasePrice != null) {
    ing.lastPurchasePrice = Number(body.lastPurchasePrice) || undefined;
  }
  if (body.lastOrderedQty != null) {
    ing.lastOrderedQty = Number(body.lastOrderedQty) || undefined;
  }
  if (body.selectedImageIndex != null) {
    const idx = Number(body.selectedImageIndex);
    if (!Number.isNaN(idx)) ing.selectedImageIndex = idx;
  }

  applySelectedImage(ing);
  await ing.save();

  return NextResponse.json({ ok: true, ingredient: ingredientPayload(ing) });
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

  const ing = await Ingredient.findOne({ restaurantId, slug });
  if (!ing) {
    return NextResponse.json({ error: "Ingredient not found" }, { status: 404 });
  }

  const dishes = await Dish.find({
    restaurantId,
    "ingredientLinks.ingredientSlug": slug,
  });
  for (const dish of dishes) {
    dish.ingredientLinks = (dish.ingredientLinks ?? []).filter(
      (link) => link.ingredientSlug !== slug
    );
    await dish.save();
  }

  const addOns = await AddOn.find({
    restaurantId,
    "ingredientLinks.ingredientSlug": slug,
  });
  for (const addOn of addOns) {
    addOn.ingredientLinks = (addOn.ingredientLinks ?? []).filter(
      (link) => link.ingredientSlug !== slug
    );
    await addOn.save();
  }

  await Ingredient.deleteOne({ restaurantId, slug });
  await refreshIngredientLabels(restaurantId);

  return NextResponse.json({ ok: true, slug });
}
