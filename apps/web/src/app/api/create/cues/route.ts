import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@backend/services/infra/auth";
import { buildCreateCues } from "@backend/services/creative/create-cues";
import { fetchWeatherCue } from "@backend/services/creative/create-weather";
import { isIngredientExpiring } from "@backend/services/dashboard/dashboard-stats";
import { connectDB } from "@backend/services/infra/mongodb";
import { Ingredient } from "@backend/models/Ingredient";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = (session.user as { restaurantId?: string }).restaurantId;
  let pantryExpiringNames: string[] = [];

  if (restaurantId) {
    await connectDB();
    const ingredients = await Ingredient.find({ restaurantId })
      .select("name expiryDate")
      .lean();
    pantryExpiringNames = ingredients
      .filter((ingredient) => isIngredientExpiring(ingredient))
      .map((ingredient) => ingredient.name);
  }

  const weather = await fetchWeatherCue();
  const cues = buildCreateCues(weather, new Date(), pantryExpiringNames);

  return NextResponse.json({ cues });
}
