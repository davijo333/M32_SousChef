import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@backend/services/infra/auth";
import { fetchRecipeBuildIngredientOptions } from "@backend/services/recipes/recipe-build-ingredient-options";
import { basicPantryIngredientName } from "@backend/services/recipes/recipe-build-plan";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = (session.user as { restaurantId?: string }).restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "No restaurant" }, { status: 400 });
  }

  let body: { query?: string; excludeUrls?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawQuery = String(body.query ?? "").trim();
  if (!rawQuery) {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

  const query = basicPantryIngredientName(rawQuery);
  const excludeUrls = Array.isArray(body.excludeUrls)
    ? body.excludeUrls.filter((u): u is string => typeof u === "string")
    : [];

  try {
    const options = await fetchRecipeBuildIngredientOptions({ query, excludeUrls });
    return NextResponse.json({ query, options });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
