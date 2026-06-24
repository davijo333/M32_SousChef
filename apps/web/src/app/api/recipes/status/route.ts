import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { AddOn } from "@/models/AddOn";
import { Dish } from "@/models/Dish";
import { Recipe } from "@/models/Recipe";
import type { RecipeStatus } from "@/models/Dish";

const ALLOWED: RecipeStatus[] = ["active", "inactive", "suggested"];

type StatusItem = { kind: "dish" | "addon"; slug: string };

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = (session.user as { restaurantId?: string }).restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "No restaurant" }, { status: 400 });
  }

  let body: { items?: StatusItem[]; status?: RecipeStatus };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const status = body.status;
  const items = body.items ?? [];
  if (!status || !ALLOWED.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (!items.length) {
    return NextResponse.json({ error: "No items" }, { status: 400 });
  }

  await connectDB();

  let updated = 0;
  for (const item of items) {
    if (item.kind === "dish") {
      const res = await Dish.updateOne(
        { restaurantId, slug: item.slug },
        { $set: { recipeStatus: status } }
      );
      await Recipe.updateOne(
        { restaurantId, kind: "dish", targetSlug: item.slug },
        { $set: { recipeStatus: status } }
      );
      updated += res.modifiedCount;
    } else if (item.kind === "addon") {
      const res = await AddOn.updateOne(
        { restaurantId, slug: item.slug },
        { $set: { recipeStatus: status } }
      );
      await Recipe.updateOne(
        { restaurantId, kind: "addon", targetSlug: item.slug },
        { $set: { recipeStatus: status } }
      );
      updated += res.modifiedCount;
    }
  }

  return NextResponse.json({ updated, status });
}
