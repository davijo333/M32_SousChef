import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { enrichNewItemsWithAgent } from "@/lib/enrich-new-items";
import type { NewCatalogItem } from "@/lib/extract-new-items";

export const maxDuration = 120;

/** Background image enrichment — called from client after fast bill parse. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const ingredients = (body.ingredients ?? []) as NewCatalogItem[];
  const dishes = (body.dishes ?? []) as NewCatalogItem[];

  if (!ingredients.length && !dishes.length) {
    return NextResponse.json({ ingredients: [], dishes: [] });
  }

  const phase = (body.phase as "supplier" | "customer" | undefined) ?? "supplier";
  const result = await enrichNewItemsWithAgent(ingredients, dishes, phase);
  return NextResponse.json(result);
}
