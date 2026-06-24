import { getServerSession } from "next-auth";
import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { assignKitchenName, isKitchenNameTaken } from "@/lib/restaurant-name-server";
import { connectDB } from "@/lib/mongodb";
import { Ingredient } from "@/models/Ingredient";
import { MenuItem } from "@/models/MenuItem";
import { Restaurant } from "@/models/Restaurant";

type SeedIngredient = {
  id: string;
  name: string;
  category: string;
  inventoryUnit: string;
  currentQty: number;
  reorderThreshold: number;
  expiryDate?: string;
  lastPurchasePrice?: number;
  source?: string;
  usageUnits?: Array<{
    unit: string;
    countPerInventoryUnit: number;
    notes?: string;
  }>;
};

type SeedMenuItem = {
  id: string;
  name: string;
  type: string;
  category: string;
  sellPrice: number;
  description?: string;
  availableAddOnIds?: string[];
  ingredientLinks?: Array<{
    ingredientId: string;
    qtyPerServing: number;
    unit: string;
    scalesWithSize?: boolean;
    notes?: string;
  }>;
};

type SeedAddOn = {
  id: string;
  name: string;
  displayName?: string;
  ingredientId?: string;
  extraCharge: number;
  qtyPerServing?: number;
  unit?: string;
};

function loadJson<T>(filename: string): T {
  const filePath = path.join(process.cwd(), "../../test", filename);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
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

  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  if (restaurant.isSeeded) {
    return NextResponse.json({ message: "Already seeded", restaurant: restaurant.name });
  }

  const ingredientsData = loadJson<{ ingredients: SeedIngredient[] }>("ingredients.json");
  const menuData = loadJson<{ menuItems: SeedMenuItem[] }>("menu-items.json");
  const addOnData = loadJson<{ addOns: SeedAddOn[]; coffeeAddOns?: SeedAddOn[] }>("add-ons.json");

  await Ingredient.deleteMany({ restaurantId });
  await MenuItem.deleteMany({ restaurantId });

  for (const ing of ingredientsData.ingredients) {
    await Ingredient.create({
      restaurantId,
      slug: ing.id,
      name: ing.name,
      category: ing.category,
      inventoryUnit: ing.inventoryUnit,
      currentQty: ing.currentQty,
      reorderThreshold: ing.reorderThreshold,
      expiryDate: ing.expiryDate ? new Date(ing.expiryDate as string) : null,
      lastPurchasePrice: ing.lastPurchasePrice,
      source: ing.source ?? "seed",
      usageUnits: ing.usageUnits,
    });
  }

  const allAddOns = [...addOnData.addOns, ...(addOnData.coffeeAddOns ?? [])];
  for (const addon of allAddOns) {
    const links = addon.ingredientId
      ? [
          {
            ingredientSlug: addon.ingredientId,
            qtyPerServing: addon.qtyPerServing ?? 1,
            unit: addon.unit ?? "each",
            scalesWithSize: false,
          },
        ]
      : [];

    await MenuItem.create({
      restaurantId,
      slug: addon.id,
      name: addon.displayName ?? addon.name,
      type: "addon",
      category: "addons",
      sellPrice: addon.extraCharge,
      source: "seed",
      ingredientLinks: links,
      availableAddOnSlugs: [],
      addonsEnabled: false,
    });
  }

  for (const item of menuData.menuItems) {
    const links = item.ingredientLinks ?? [];
    const addonsEnabled = item.type === "customizable";

    await MenuItem.create({
      restaurantId,
      slug: item.id,
      name: item.name,
      type: item.type,
      category: item.category,
      sellPrice: item.sellPrice,
      description: item.description,
      source: "seed",
      availableAddOnSlugs: item.availableAddOnIds ?? [],
      addonsEnabled,
      ingredientLinks: links.map((l) => ({
        ingredientSlug: l.ingredientId,
        qtyPerServing: l.qtyPerServing,
        unit: l.unit,
        scalesWithSize: l.scalesWithSize ?? true,
        notes: l.notes,
      })),
    });
  }

  const demoName = "Sunrise Diner";
  if (!(await isKitchenNameTaken(demoName, restaurant._id.toString()))) {
    await assignKitchenName(restaurant._id.toString(), demoName);
  }

  restaurant.isSeeded = true;
  await restaurant.save();

  return NextResponse.json({
    ok: true,
    ingredients: ingredientsData.ingredients.length,
    menuItems: menuData.menuItems.length,
    addOns: allAddOns.length,
  });
}
