import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { MenuItem } from "@/models/MenuItem";
import { Ingredient } from "@/models/Ingredient";

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";

type AgentLink = {
  ingredientSlug: string;
  qtyPerServing: number;
  unit: string;
  scalesWithSize?: boolean;
  confidence?: number;
  notes?: string;
};

/** Run linker agent for menu items missing ingredient links. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = (session.user as { restaurantId?: string }).restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "No restaurant" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const menuItemSlugs = (body.menuItemSlugs as string[] | undefined)?.filter(Boolean);

  await connectDB();

  const [ingredients, menuItems] = await Promise.all([
    Ingredient.find({ restaurantId }).lean(),
    MenuItem.find({ restaurantId }).lean(),
  ]);

  const ingredientPayload = ingredients.map((i) => ({
    slug: i.slug,
    name: i.name,
    inventoryUnit: i.inventoryUnit,
    usageUnits: i.usageUnits ?? [],
  }));

  const targets = menuItems.filter((m) => {
    if (m.type === "addon") return !m.ingredientLinks?.length;
    if (menuItemSlugs?.length) return menuItemSlugs.includes(m.slug);
    return !m.ingredientLinks?.length;
  });

  const results: Array<{
    menuItemSlug: string;
    ok: boolean;
    linkedCount: number;
    warnings?: string[];
    error?: string;
  }> = [];

  for (const item of targets) {
    try {
      const agentRes = await fetch(`${AGENT_URL}/link-recipe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menu_item: {
            slug: item.slug,
            name: item.name,
            type: item.type,
            category: item.category,
            description: item.description ?? "",
          },
          ingredients: ingredientPayload,
        }),
      });

      if (!agentRes.ok) {
        const errText = await agentRes.text();
        results.push({
          menuItemSlug: item.slug,
          ok: false,
          linkedCount: 0,
          error: errText || "Linker agent failed",
        });
        continue;
      }

      const data = (await agentRes.json()) as {
        links: AgentLink[];
        warnings?: string[];
      };

      const links = (data.links ?? []).filter((l) => l.confidence == null || l.confidence >= 0.35);
      if (!links.length) {
        results.push({
          menuItemSlug: item.slug,
          ok: true,
          linkedCount: 0,
          warnings: data.warnings ?? ["No links suggested"],
        });
        continue;
      }

      await MenuItem.updateOne(
        { _id: item._id },
        {
          $set: {
            ingredientLinks: links.map((l) => ({
              ingredientSlug: l.ingredientSlug,
              qtyPerServing: l.qtyPerServing,
              unit: l.unit,
              scalesWithSize: l.scalesWithSize ?? true,
              notes: l.notes,
            })),
          },
        }
      );

      results.push({
        menuItemSlug: item.slug,
        ok: true,
        linkedCount: links.length,
        warnings: data.warnings,
      });
    } catch (err) {
      results.push({
        menuItemSlug: item.slug,
        ok: false,
        linkedCount: 0,
        error: err instanceof Error ? err.message : "Link failed",
      });
    }
  }

  const linked = results.filter((r) => r.linkedCount > 0).length;

  return NextResponse.json({
    ok: results.every((r) => r.ok),
    processed: results.length,
    linked,
    results,
  });
}
