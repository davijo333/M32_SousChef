import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@backend/services/infra/auth";
import { enrichNewItemsWithAgent } from "@backend/services/catalog/enrich-new-items";
import type { NewCatalogItem } from "@backend/services/catalog/extract-new-items";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const ingredients = (body.ingredients ?? []) as NewCatalogItem[];

  if (!ingredients.length) {
    return NextResponse.json({ ingredients: [], dishes: [] });
  }

  const enriched = await enrichNewItemsWithAgent(ingredients, []);
  return NextResponse.json(enriched);
}
