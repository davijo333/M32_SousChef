import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { assignKitchenName } from "@/lib/restaurant-name-server";
import { seedKitchenCatalog } from "@/lib/seed-kitchen";
import { seedKitchenOrders } from "@/lib/seed-orders";
import { Restaurant } from "@/models/Restaurant";

const DEMO_KITCHEN_NAME = "Panera Cafe";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = (session.user as { restaurantId?: string }).restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "No restaurant" }, { status: 400 });
  }

  const force = new URL(req.url).searchParams.get("force") === "1";

  try {
    await connectDB();

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    if (restaurant.isSeeded && !force) {
      return NextResponse.json({
        message: "Already seeded",
        restaurant: restaurant.name,
        ok: true,
      });
    }

    const userId = session.user.id;
    if (!userId) {
      return NextResponse.json({ error: "No user" }, { status: 400 });
    }

    const counts = await seedKitchenCatalog(restaurantId);
    const orderCounts = await seedKitchenOrders(restaurantId, userId);

    let kitchenName = DEMO_KITCHEN_NAME;
    let assignResult = await assignKitchenName(restaurant._id.toString(), kitchenName);
    if (!assignResult.ok) {
      kitchenName = `${DEMO_KITCHEN_NAME} ${restaurant._id.toString().slice(-4)}`;
      assignResult = await assignKitchenName(restaurant._id.toString(), kitchenName);
    }
    if (assignResult.ok) {
      kitchenName = assignResult.name;
    } else if (!restaurant.kitchenNameSet) {
      restaurant.kitchenNameSet = true;
    }

    restaurant.isSeeded = true;
    await restaurant.save();

    return NextResponse.json({
      ok: true,
      restaurant: assignResult.ok ? assignResult.name : kitchenName,
      ...counts,
      ...orderCounts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Seed failed";
    console.error("POST /api/seed failed:", err);
    return NextResponse.json({ error: message, ok: false }, { status: 500 });
  }
}
