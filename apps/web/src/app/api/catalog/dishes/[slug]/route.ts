import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { applySelectedDishImage } from "@/lib/dish-enrichment";
import { linkedAddOnSlugsForDish, syncDishAddOnLinks } from "@/lib/dish-addon-links";
import { dishPayload, normalizeIngredientLinks } from "@/lib/dish-payload";
import { refreshIngredientLabels } from "@/lib/ingredient-labels";
import { scheduleRecipeBuild } from "@/lib/recipe-builder";
import { connectDB } from "@/lib/mongodb";
import { Dish } from "@/models/Dish";

type RouteContext = { params: Promise<{ slug: string }> };

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

  const dish = await Dish.findOne({ restaurantId, slug }).lean();
  if (!dish) {
    return NextResponse.json({ error: "Dish not found" }, { status: 404 });
  }

  const linkedAddOnSlugs = await linkedAddOnSlugsForDish(restaurantId, slug);

  return NextResponse.json({
    dish: { ...dishPayload(dish), linkedAddOnSlugs },
  });
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
  const dish = await Dish.findOne({ restaurantId, slug });
  if (!dish) {
    return NextResponse.json({ error: "Dish not found" }, { status: 404 });
  }

  if (body.name != null) dish.name = String(body.name).trim() || dish.name;
  if (body.category != null) dish.category = String(body.category).trim() || dish.category;
  if (body.classification != null) {
    const classification =
      String(body.classification).trim() || dish.classification || dish.category;
    dish.classification = classification;
    dish.category = classification;
  }
  if (body.sellPrice != null) dish.sellPrice = Number(body.sellPrice);
  if (body.description !== undefined) {
    dish.description = String(body.description).trim() || undefined;
  }
  if (body.selectedImageIndex != null) {
    const idx = Number(body.selectedImageIndex);
    if (!Number.isNaN(idx)) dish.selectedImageIndex = idx;
  }
  if (body.ingredientLinks != null) {
    dish.ingredientLinks = normalizeIngredientLinks(body.ingredientLinks);
    if (dish.ingredientLinks.length && !dish.recipeStatus) {
      dish.recipeStatus = "new";
    }
  }

  applySelectedDishImage(dish);
  await dish.save();

  if (body.linkedAddOnSlugs != null) {
    const linkedAddOnSlugs = Array.isArray(body.linkedAddOnSlugs)
      ? body.linkedAddOnSlugs.map((s: unknown) => String(s).trim()).filter(Boolean)
      : [];
    await syncDishAddOnLinks(restaurantId, slug, linkedAddOnSlugs);
  }

  if (body.ingredientLinks != null || body.linkedAddOnSlugs != null) {
    await refreshIngredientLabels(restaurantId);
  }

  if (body.ingredientLinks != null && dish.ingredientLinks.length > 0) {
    scheduleRecipeBuild(restaurantId, "dish", slug);
  }

  const linkedAddOnSlugs = await linkedAddOnSlugsForDish(restaurantId, slug);

  return NextResponse.json({
    ok: true,
    dish: { ...dishPayload(dish), linkedAddOnSlugs },
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
  const deleted = await Dish.findOneAndDelete({ restaurantId, slug });
  if (!deleted) {
    return NextResponse.json({ error: "Dish not found" }, { status: 404 });
  }

  await syncDishAddOnLinks(restaurantId, slug, []);
  await refreshIngredientLabels(restaurantId);

  return NextResponse.json({ ok: true, slug });
}
