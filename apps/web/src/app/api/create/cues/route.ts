import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { buildCreateCues } from "@/lib/create-cues";
import { fetchWeatherCue } from "@/lib/create-weather";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weather = await fetchWeatherCue();
  const cues = buildCreateCues(weather);

  return NextResponse.json({ cues });
}
