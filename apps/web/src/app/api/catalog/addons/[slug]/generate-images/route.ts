import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@backend/services/infra/auth";
import { normalizeIngredientLinks } from "@backend/services/catalog/dish-payload";
import { connectDB } from "@backend/services/infra/mongodb";
import { AddOn } from "@backend/models/AddOn";
import { regenerateAddOnImages } from "@backend/services/catalog/regenerate-addon-images";

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(req: Request, context: RouteContext) {
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
  const mode = body.mode === "pair" ? "pair" : "secondary";
  const selectedImageIndex =
    body.selectedImageIndex != null ? Number(body.selectedImageIndex) : undefined;
  const ingredientNames = Array.isArray(body.ingredientNames)
    ? body.ingredientNames.map((name: unknown) => String(name).trim()).filter(Boolean)
    : undefined;
  const ingredientLinks =
    body.ingredientLinks != null ? normalizeIngredientLinks(body.ingredientLinks) : undefined;

  await connectDB();
  const addOn = await AddOn.findOne({ restaurantId, slug });
  if (!addOn) {
    return NextResponse.json({ error: "Add-on not found" }, { status: 404 });
  }

  try {
    const updated = await regenerateAddOnImages(
      addOn,
      mode,
      Number.isNaN(selectedImageIndex) ? undefined : selectedImageIndex,
      {
        name: body.name != null ? String(body.name).trim() : undefined,
        classification:
          body.classification != null ? String(body.classification).trim() : undefined,
        description: body.description != null ? String(body.description) : undefined,
        ingredientNames,
        ingredientLinks,
      }
    );
    return NextResponse.json({
      ok: true,
      addOn: {
        slug: updated.slug,
        name: updated.name,
        classification: updated.classification ?? "addon",
        description: updated.description,
        sellPrice: updated.sellPrice,
        linkedDishSlugs: updated.linkedDishSlugs ?? [],
        ingredientLinks: updated.ingredientLinks ?? [],
        imageUrl: updated.imageUrl,
        imageCandidates: updated.imageCandidates ?? [],
        selectedImageIndex: updated.selectedImageIndex ?? 0,
        imageGenerationAttempted: updated.imageGenerationAttempted ?? false,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Image generation failed";
    if (message.includes("Agent") || message.includes("fetch")) {
      return NextResponse.json(
        { error: "Image agent unavailable. Run: npm run start:agents" },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
