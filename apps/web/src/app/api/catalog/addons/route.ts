import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { addOnSlugFromName } from "@/lib/dish-catalog";
import { applySelectedAddOnImage } from "@/lib/dish-enrichment";
import { normalizeIngredientLinks } from "@/lib/dish-payload";
import { refreshIngredientLabels } from "@/lib/ingredient-labels";
import { scheduleRecipeBuild } from "@/lib/recipe-builder";
import { connectDB } from "@/lib/mongodb";
import { AddOn } from "@/models/AddOn";

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

  await connectDB();

  const slug = body.slug?.trim() || addOnSlugFromName(name);
  const existing = await AddOn.findOne({ restaurantId, slug });
  if (existing) {
    return NextResponse.json({ error: "Add-on already exists" }, { status: 409 });
  }

  const linkedDishSlugs = Array.isArray(body.linkedDishSlugs)
    ? body.linkedDishSlugs.map((s: unknown) => String(s).trim()).filter(Boolean)
    : [];
  const classification = String(body.classification ?? "addon").trim() || "addon";
  const description = body.description != null ? String(body.description) : undefined;
  const ingredientLinks = normalizeIngredientLinks(body.ingredientLinks);

  const addOn = await AddOn.create({
    restaurantId,
    slug,
    name,
    classification,
    description,
    sellPrice: Number(body.sellPrice ?? 0),
    linkedDishSlugs,
    ingredientLinks,
    source: "manual_add",
  });
  applySelectedAddOnImage(addOn);
  await addOn.save();

  if (ingredientLinks.length > 0) {
    scheduleRecipeBuild(restaurantId, "addon", slug);
  }

  return NextResponse.json({
    ok: true,
    addOn: {
      slug: addOn.slug,
      name: addOn.name,
      classification: addOn.classification ?? "addon",
      description: addOn.description,
      sellPrice: addOn.sellPrice,
      linkedDishSlugs: addOn.linkedDishSlugs,
      ingredientLinks: addOn.ingredientLinks ?? [],
      imageUrl: addOn.imageUrl,
      imageCandidates: addOn.imageCandidates ?? [],
      selectedImageIndex: addOn.selectedImageIndex ?? 0,
      imageGenerationAttempted: addOn.imageGenerationAttempted ?? false,
    },
  });
}
