import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { dishMissingPhotos } from "@/lib/dish-image-status";
import { reconcileKitchenInventory } from "@/lib/kitchen-inventory";
import { buildSoldThisWeekMaps } from "@/lib/menu-sales-stats";
import { buildLastPurchaseDateByIngredientSlug } from "@/lib/ingredient-purchase-stats";
import { connectDB } from "@/lib/mongodb";
import { AddOn } from "@/models/AddOn";
import { Dish } from "@/models/Dish";
import { Ingredient } from "@/models/Ingredient";
import { PurchaseOrder } from "@/models/PurchaseOrder";
import { Restaurant } from "@/models/Restaurant";
import { SalesOrder } from "@/models/SalesOrder";

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

  const [restaurant, ingredients, dishes, addOns, salesOrders, purchaseOrders, purchaseOrderCount, salesOrderCount] =
    await Promise.all([
      Restaurant.findById(restaurantId).lean(),
      Ingredient.find({ restaurantId, imageGenerationAttempted: true }).sort({ name: 1 }).lean(),
      Dish.find({ restaurantId }).sort({ name: 1 }).lean(),
      AddOn.find({ restaurantId }).sort({ name: 1 }).lean(),
      SalesOrder.find({ restaurantId }).select("saleDate uploadDate items").lean(),
      PurchaseOrder.find({ restaurantId }).select("purchaseDate uploadDate items").lean(),
      PurchaseOrder.countDocuments({ restaurantId }),
      SalesOrder.countDocuments({ restaurantId }),
    ]);

  const { dish: soldThisWeekByDish, addon: soldThisWeekByAddOn } =
    buildSoldThisWeekMaps(salesOrders);
  const lastPurchaseDateByIngredient = buildLastPurchaseDateByIngredientSlug(purchaseOrders);

  const linkedAddOnsByDish = new Map<string, string[]>();
  for (const addOn of addOns) {
    for (const dishSlug of addOn.linkedDishSlugs ?? []) {
      const list = linkedAddOnsByDish.get(dishSlug) ?? [];
      list.push(addOn.slug);
      linkedAddOnsByDish.set(dishSlug, list);
    }
  }

  const menuItems = [
    ...dishes.map((d) => ({
      kind: "dish" as const,
      slug: d.slug,
      name: d.name,
      sellPrice: d.sellPrice,
      totalSold: d.totalSold ?? 0,
      soldThisWeek: soldThisWeekByDish.get(d.slug) ?? 0,
      recipeStatus: d.recipeStatus ?? "new",
      category: d.category,
      classification: d.classification ?? d.category,
      description: d.description,
      imageUrl: d.imageUrl,
      imageCandidates: d.imageCandidates ?? [],
      selectedImageIndex: d.selectedImageIndex ?? 0,
      imageGenerationAttempted: d.imageGenerationAttempted ?? false,
      missingPhotos: dishMissingPhotos(d),
      ingredientLinks: (d.ingredientLinks ?? []).map((link) => ({
        ingredientSlug: link.ingredientSlug,
        qtyPerServing: link.qtyPerServing,
        unit: link.unit,
        scalesWithSize: link.scalesWithSize ?? true,
        notes: link.notes,
      })),
      linkedAddOnSlugs: linkedAddOnsByDish.get(d.slug) ?? [],
    })),
    ...addOns.map((a) => ({
      kind: "addon" as const,
      slug: a.slug,
      name: a.name,
      sellPrice: a.sellPrice,
      totalSold: a.totalSold ?? 0,
      soldThisWeek: soldThisWeekByAddOn.get(a.slug) ?? 0,
      recipeStatus: a.recipeStatus ?? "new",
      category: a.classification ?? "addon",
      classification: a.classification ?? "addon",
      description: a.description,
      linkedDishSlugs: a.linkedDishSlugs ?? [],
      ingredientLinks: (a.ingredientLinks ?? []).map((link) => ({
        ingredientSlug: link.ingredientSlug,
        qtyPerServing: link.qtyPerServing,
        unit: link.unit,
        scalesWithSize: link.scalesWithSize ?? false,
        notes: link.notes,
      })),
      imageUrl: a.imageUrl,
      imageCandidates: a.imageCandidates ?? [],
      selectedImageIndex: a.selectedImageIndex ?? 0,
      imageGenerationAttempted: a.imageGenerationAttempted ?? false,
      missingPhotos: dishMissingPhotos(a),
    })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    restaurant: restaurant
      ? { name: restaurant.name, isSeeded: restaurant.isSeeded }
      : { name: "Your kitchen", isSeeded: false },
    orderStats: {
      purchaseOrderCount,
      salesOrderCount,
      hasOrders: purchaseOrderCount > 0 || salesOrderCount > 0,
    },
    menuItems,
    ingredients: ingredients.map((i) => {
      const lastPurchaseDate = lastPurchaseDateByIngredient.get(i.slug);
      return {
        slug: i.slug,
        sku: i.sku ?? i.slug,
        name: i.name,
        category: i.category,
        inventoryUnit: i.inventoryUnit,
        currentQty: i.currentQty,
        reorderThreshold: i.reorderThreshold,
        lastPurchasePrice: i.lastPurchasePrice,
        lastPurchaseDate: lastPurchaseDate?.toISOString() ?? null,
        lastOrderedQty: i.lastOrderedQty,
        imageUrl: i.imageUrl,
        imageCandidates: i.imageCandidates ?? [],
        selectedImageIndex: i.selectedImageIndex ?? 0,
        imageGenerationAttempted: i.imageGenerationAttempted ?? false,
        brandName: i.brandName,
        label: i.label,
      };
    }),
  });
}
