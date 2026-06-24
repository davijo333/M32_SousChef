import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, itemType, brandName, quantity, unit, extraKeywords } = await req.json();
  if (!name || (itemType !== "ingredient" && itemType !== "dish")) {
    return NextResponse.json({ error: "name and itemType required" }, { status: 400 });
  }

  try {
    const agentRes = await fetch(`${AGENT_URL}/suggest-images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        item_type: itemType,
        brand_name: brandName ?? "",
        quantity: quantity ?? 0,
        unit: unit ?? "",
        extra_keywords: extraKeywords ?? "",
      }),
    });
    if (!agentRes.ok) {
      const err = await agentRes.text();
      return NextResponse.json({ error: `Agent failed: ${err}` }, { status: 502 });
    }
    const data = await agentRes.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: `Agent unreachable at ${AGENT_URL}` },
      { status: 503 }
    );
  }
}
