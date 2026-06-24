import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { persistCatalogImage } from "@/lib/r2-storage";
import { MenuItem } from "@/models/MenuItem";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = (session.user as { restaurantId?: string }).restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "No restaurant" }, { status: 400 });
  }

  await connectDB();
  const menuItems = await MenuItem.find({ restaurantId })
    .select(
      "name slug category type sellPrice imageUrl ingredientLinks availableAddOnSlugs addonsEnabled"
    )
    .sort({ name: 1 })
    .lean();

  return NextResponse.json({ menuItems });
}

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

  const slug =
    body.slug?.trim() ||
    `mi-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

  const itemType = body.type || "standard";
  const addonsEnabled =
    typeof body.addonsEnabled === "boolean"
      ? body.addonsEnabled
      : itemType === "customizable";

  await connectDB();
  const exists = await MenuItem.findOne({ restaurantId, slug });
  if (exists) {
    return NextResponse.json({ error: "Menu item already exists" }, { status: 409 });
  }

  const remoteImageUrl = body.imageUrl as string | undefined;

  const menuItem = await MenuItem.create({
    restaurantId,
    slug,
    name,
    type: itemType,
    category: body.category || "other",
    sellPrice: Number(body.sellPrice ?? body.unitPrice ?? 0),
    description: body.description || undefined,
    source: "manual_add",
    ingredientLinks: Array.isArray(body.ingredientLinks)
      ? body.ingredientLinks.map(
          (l: {
            ingredientSlug: string;
            qtyPerServing: number;
            unit: string;
            scalesWithSize?: boolean;
          }) => ({
            ingredientSlug: l.ingredientSlug,
            qtyPerServing: l.qtyPerServing,
            unit: l.unit,
            scalesWithSize: l.scalesWithSize ?? true,
          })
        )
      : [],
    availableAddOnSlugs: Array.isArray(body.availableAddOnSlugs)
      ? body.availableAddOnSlugs
      : [],
    addonsEnabled,
  });

  if (remoteImageUrl?.startsWith("http")) {
    try {
      const stored = await persistCatalogImage("dishes", menuItem._id.toString(), remoteImageUrl);
      menuItem.imageR2Key = stored.r2Key;
      menuItem.imageUrl = stored.publicUrl;
      await menuItem.save();
    } catch {
      menuItem.imageUrl = remoteImageUrl;
      await menuItem.save();
    }
  }

  return NextResponse.json({
    ok: true,
    slug: menuItem.slug,
    name: menuItem.name,
    imageUrl: menuItem.imageUrl,
    imageR2Key: menuItem.imageR2Key,
  });
}
