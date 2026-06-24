import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { dishSlugFromName } from "@/lib/dish-catalog";
import { linkedAddOnSlugsForDish, syncDishAddOnLinks } from "@/lib/dish-addon-links";
import { dishPayload, normalizeIngredientLinks } from "@/lib/dish-payload";
import { refreshIngredientLabels } from "@/lib/ingredient-labels";
import { scheduleRecipeBuild } from "@/lib/recipe-builder";
import { connectDB } from "@/lib/mongodb";
import { Dish } from "@/models/Dish";

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

  const classification = String(body.classification ?? body.category ?? "other").trim() || "other";
  const ingredientLinks = normalizeIngredientLinks(body.ingredientLinks);
  const linkedAddOnSlugs = Array.isArray(body.linkedAddOnSlugs)
    ? body.linkedAddOnSlugs.map((slug: unknown) => String(slug).trim()).filter(Boolean)
    : [];

  await connectDB();

  const slug = body.slug?.trim() || dishSlugFromName(name);
  const existing = await Dish.findOne({ restaurantId, slug });
  if (existing) {
    return NextResponse.json({ error: "Dish already exists" }, { status: 409 });
  }

  const dish = await Dish.create({
    restaurantId,
    slug,
    name,
    category: classification,
    classification,
    sellPrice: Number(body.sellPrice ?? 0),
    description:
      body.description !== undefined ? String(body.description).trim() || undefined : undefined,
    ingredientLinks,
    recipeStatus: ingredientLinks.length ? "new" : undefined,
    source: "manual_add",
  });

  await syncDishAddOnLinks(restaurantId, slug, linkedAddOnSlugs);
  await refreshIngredientLabels(restaurantId);

  if (ingredientLinks.length > 0) {
    scheduleRecipeBuild(restaurantId, "dish", slug);
  }

  const payload = dishPayload(dish);
  return NextResponse.json({
    ok: true,
    dish: {
      ...payload,
      linkedAddOnSlugs: await linkedAddOnSlugsForDish(restaurantId, slug),
    },
  });
}
