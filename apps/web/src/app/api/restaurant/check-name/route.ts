import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { validateKitchenName } from "@/lib/kitchen-name";
import { connectDB } from "@/lib/mongodb";
import { ensureRestaurantForSession, isKitchenNameTaken } from "@/lib/restaurant-name-server";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const name = String(searchParams.get("name") ?? "").trim();

  const validationError = validateKitchenName(name);
  if (validationError) {
    return NextResponse.json({ available: false, error: validationError });
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
      { available: false, error: "Session expired — please sign out and sign in again." },
      { status: 401 }
    );
  }
  const taken = await isKitchenNameTaken(name, restaurant._id.toString());

  return NextResponse.json({
    available: !taken,
    error: taken ? "That kitchen name is already taken." : undefined,
  });
}
