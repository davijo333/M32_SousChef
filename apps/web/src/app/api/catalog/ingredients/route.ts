import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  applyIngredientStockUpdate,
  buildIngredientSku,
  findExistingIngredient,
} from "@/lib/ingredient-identity";
import { connectDB } from "@/lib/mongodb";
import { persistCatalogImage } from "@/lib/r2-storage";
import { Ingredient } from "@/models/Ingredient";

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
  const ingredients = await Ingredient.find({ restaurantId })
    .select("name slug sku category inventoryUnit currentQty imageUrl imageR2Key brandName")
    .sort({ name: 1 })
    .lean();

  return NextResponse.json({ ingredients });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = (session.user as { restaurantId?: string }).restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "No restaurant" }, { status: 400 });
  }

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const brandName = body.brandName?.trim() || undefined;
  const inventoryUnit = body.inventoryUnit || body.unit || "each";
  const addQty = Number(body.currentQty ?? body.quantity ?? 0);
  const identity = { brandName, name, inventoryUnit, rawName: name };
  const sku = body.sku?.trim() || buildIngredientSku(identity);

  await connectDB();

  const existing = await findExistingIngredient(restaurantId, { ...identity, sku });
  if (existing) {
    applyIngredientStockUpdate(existing, {
      addQty,
      unitPrice: body.unitPrice != null ? Number(body.unitPrice) : undefined,
      orderedQty: addQty > 0 ? addQty : undefined,
      brandName,
      sku,
    });
    existing.imageGenerationAttempted = true;
    const remoteImageUrl = body.imageUrl as string | undefined;
    if (remoteImageUrl?.startsWith("http") && !existing.imageUrl) {
      try {
        const stored = await persistCatalogImage(
          "ingredients",
          existing._id.toString(),
          remoteImageUrl
        );
        existing.imageR2Key = stored.r2Key;
        existing.imageUrl = stored.publicUrl;
      } catch {
        existing.imageUrl = remoteImageUrl;
      }
    }
    await existing.save();
    return NextResponse.json({
      ok: true,
      updated: true,
      slug: existing.slug,
      sku: existing.sku,
      name: existing.name,
      ingredient: {
        slug: existing.slug,
        sku: existing.sku,
        name: existing.name,
        category: existing.category,
        brandName: existing.brandName,
        inventoryUnit: existing.inventoryUnit,
        currentQty: existing.currentQty,
        reorderThreshold: existing.reorderThreshold,
        lastPurchasePrice: existing.lastPurchasePrice,
        lastOrderedQty: existing.lastOrderedQty,
        imageUrl: existing.imageUrl,
        imageCandidates: existing.imageCandidates ?? [],
        selectedImageIndex: existing.selectedImageIndex ?? 0,
        imageGenerationAttempted: existing.imageGenerationAttempted ?? true,
      },
    });
  }

  const slug =
    body.slug?.trim() ||
    `ing-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

  const slugConflict = await Ingredient.findOne({ restaurantId, slug });
  if (slugConflict) {
    return NextResponse.json({ error: "Ingredient already exists" }, { status: 409 });
  }

  const remoteImageUrl = body.imageUrl as string | undefined;

  const ingredient = await Ingredient.create({
    restaurantId,
    slug,
    sku,
    name,
    category: body.category || "misc",
    inventoryUnit,
    currentQty: addQty,
    reorderThreshold: Number(body.reorderThreshold ?? 1),
    lastPurchasePrice: body.unitPrice != null ? Number(body.unitPrice) : undefined,
    lastOrderedQty: addQty > 0 ? addQty : undefined,
    brandName,
    source: "manual_add",
    imageGenerationAttempted: true,
    usageUnits: [{ unit: inventoryUnit, countPerInventoryUnit: 1 }],
  });

  if (remoteImageUrl?.startsWith("http")) {
    try {
      const stored = await persistCatalogImage(
        "ingredients",
        ingredient._id.toString(),
        remoteImageUrl
      );
      ingredient.imageR2Key = stored.r2Key;
      ingredient.imageUrl = stored.publicUrl;
      await ingredient.save();
    } catch {
      ingredient.imageUrl = remoteImageUrl;
      await ingredient.save();
    }
  }

  return NextResponse.json({
    ok: true,
    slug: ingredient.slug,
    sku: ingredient.sku,
    name: ingredient.name,
    ingredient: {
      slug: ingredient.slug,
      sku: ingredient.sku,
      name: ingredient.name,
      category: ingredient.category,
      brandName: ingredient.brandName,
      inventoryUnit: ingredient.inventoryUnit,
      currentQty: ingredient.currentQty,
      reorderThreshold: ingredient.reorderThreshold,
      lastPurchasePrice: ingredient.lastPurchasePrice,
      lastOrderedQty: ingredient.lastOrderedQty,
      imageUrl: ingredient.imageUrl,
      imageCandidates: ingredient.imageCandidates ?? [],
      selectedImageIndex: ingredient.selectedImageIndex ?? 0,
      imageGenerationAttempted: ingredient.imageGenerationAttempted ?? true,
    },
  });
}
