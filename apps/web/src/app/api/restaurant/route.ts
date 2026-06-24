import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import {
  assignKitchenName,
  ensureRestaurantForSession,
  ensureRestaurantNameKey,
} from "@/lib/restaurant-name-server";
import { Restaurant } from "@/models/Restaurant";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  let restaurant;
  try {
    restaurant = await ensureRestaurantForSession({
      id: (session.user as { id?: string }).id,
      email: session.user.email,
      name: session.user.name,
    });
  } catch {
    return NextResponse.json(
      { error: "Session expired — please sign out and sign in again." },
      { status: 401 }
    );
  }
  const restaurantId = restaurant._id.toString();

  await ensureRestaurantNameKey(restaurant);

  const refreshed = await Restaurant.findById(restaurantId).lean();
  if (!refreshed) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  return NextResponse.json({
    restaurantId,
    name: refreshed.name,
    kitchenNameSet: Boolean(refreshed.kitchenNameSet),
    isSeeded: Boolean(refreshed.isSeeded),
  });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Kitchen name is required" }, { status: 400 });
  }

  await connectDB();
  let restaurant;
  try {
    restaurant = await ensureRestaurantForSession({
      id: (session.user as { id?: string }).id,
      email: session.user.email,
      name: session.user.name,
    });
  } catch {
    return NextResponse.json(
      { error: "Session expired — please sign out and sign in again." },
      { status: 401 }
    );
  }
  const result = await assignKitchenName(restaurant._id.toString(), name);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    restaurantId: restaurant._id.toString(),
    name: result.name,
    kitchenNameSet: true,
  });
}
