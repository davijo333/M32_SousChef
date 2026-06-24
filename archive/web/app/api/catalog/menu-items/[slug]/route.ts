import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { MenuItem } from "@/models/MenuItem";

type RouteContext = { params: { slug: string } };

export async function PATCH(req: Request, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = (session.user as { restaurantId?: string }).restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "No restaurant" }, { status: 400 });
  }

  const body = await req.json();
  await connectDB();

  const menuItem = await MenuItem.findOne({ restaurantId, slug: params.slug });
  if (!menuItem) {
    return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
  }

  if (typeof body.addonsEnabled === "boolean") {
    menuItem.addonsEnabled = body.addonsEnabled;
  }

  if (Array.isArray(body.availableAddOnSlugs)) {
    menuItem.availableAddOnSlugs = body.availableAddOnSlugs.filter(
      (s: unknown) => typeof s === "string"
    );
  }

  await menuItem.save();

  return NextResponse.json({
    ok: true,
    slug: menuItem.slug,
    addonsEnabled: menuItem.addonsEnabled,
    availableAddOnSlugs: menuItem.availableAddOnSlugs,
  });
}
