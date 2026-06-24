import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { validateKitchenName } from "@/lib/kitchen-name";
import { connectDB } from "@/lib/mongodb";
import { ensureRestaurantForUser, isKitchenNameTaken } from "@/lib/restaurant-name-server";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as { id?: string }).id;
  if (!userId) {
    return NextResponse.json({ error: "No user" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const name = String(searchParams.get("name") ?? "").trim();

  const validationError = validateKitchenName(name);
  if (validationError) {
    return NextResponse.json({ available: false, error: validationError });
  }

  await connectDB();
  const restaurant = await ensureRestaurantForUser(userId);
  const taken = await isKitchenNameTaken(name, restaurant._id.toString());

  return NextResponse.json({
    available: !taken,
    error: taken ? "That kitchen name is already taken." : undefined,
  });
}
