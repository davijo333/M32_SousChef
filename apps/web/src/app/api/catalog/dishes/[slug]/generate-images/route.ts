import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { dishPayload, normalizeIngredientLinks } from "@/lib/dish-payload";
import { regenerateDishImages } from "@/lib/regenerate-dish-images";
import { connectDB } from "@/lib/mongodb";
import { Dish } from "@/models/Dish";

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
    ? body.ingredientNames
        .map((name: unknown) => String(name).trim())
        .filter(Boolean)
    : undefined;

  const ingredientLinks =
    body.ingredientLinks != null ? normalizeIngredientLinks(body.ingredientLinks) : undefined;

  await connectDB();
  const dish = await Dish.findOne({ restaurantId, slug });
  if (!dish) {
    return NextResponse.json({ error: "Dish not found" }, { status: 404 });
  }

  try {
    const updated = await regenerateDishImages(
      dish,
      mode,
      Number.isNaN(selectedImageIndex) ? undefined : selectedImageIndex,
      {
        name: body.name != null ? String(body.name).trim() : undefined,
        description:
          body.description !== undefined ? String(body.description).trim() : undefined,
        classification:
          body.classification != null ? String(body.classification).trim() : undefined,
        ingredientNames,
        ingredientLinks,
      }
    );
    return NextResponse.json({ ok: true, dish: dishPayload(updated) });
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
