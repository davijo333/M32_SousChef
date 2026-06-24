import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Ingredient } from "@/models/Ingredient";
import { MenuItem } from "@/models/MenuItem";
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

  const restaurant = await Restaurant.findById(restaurantId).lean();
  const ingredients = await Ingredient.find({ restaurantId }).lean();
  const menuItems = await MenuItem.find({ restaurantId }).lean();

  const now = Date.now();
  const expiring = ingredients.filter(
    (i) => i.expiryDate && new Date(i.expiryDate).getTime() - now < 2 * 86400000
  );
  const lowStock = ingredients.filter((i) => i.currentQty < i.reorderThreshold);

  return NextResponse.json({
    restaurant: restaurant
      ? { name: restaurant.name, isSeeded: Boolean(restaurant.isSeeded) }
      : { name: "Your kitchen", isSeeded: false },
    counts: {
      ingredients: ingredients.length,
      menuItems: menuItems.length,
      expiring: expiring.length,
      lowStock: lowStock.length,
    },
    expiring: expiring.map((i) => ({
      name: i.name,
      currentQty: i.currentQty,
      inventoryUnit: i.inventoryUnit,
      expiryDate: i.expiryDate,
    })),
    lowStock: lowStock.map((i) => ({
      name: i.name,
      currentQty: i.currentQty,
      reorderThreshold: i.reorderThreshold,
      inventoryUnit: i.inventoryUnit,
    })),
  });
}
