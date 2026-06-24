import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { matchLineToCatalog } from "@/lib/bill-normalizer";
import { connectDB } from "@/lib/mongodb";
import { BillUpload } from "@/models/BillUpload";
import { Ingredient } from "@/models/Ingredient";

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
  const billIds = (body.billIds as string[] | undefined)?.filter(Boolean) ?? [];
  if (!billIds.length) {
    return NextResponse.json({ error: "billIds required" }, { status: 400 });
  }

  await connectDB();
  const ingredients = await Ingredient.find({ restaurantId }).select("slug name").lean();
  const results: Array<{ billId: string; ok: boolean; linkedLines: number; error?: string }> = [];

  for (const id of billIds) {
    const bill = await BillUpload.findOne({ _id: id, restaurantId, billType: "supplier" });
    if (!bill) {
      results.push({ billId: id, ok: false, linkedLines: 0, error: "Order not found" });
      continue;
    }

    let linkedLines = 0;
    bill.lines = bill.lines.map((line) => {
      const match = matchLineToCatalog(
        line.rawName,
        ingredients.map((i) => ({ slug: i.slug, name: i.name })),
        [],
        "ingredient"
      );
      const updated = {
        ...line,
        normalizedName: match.normalizedName,
        matchedIngredientSlug: match.matchedIngredientSlug,
      };
      if (match.matchedIngredientSlug) linkedLines += 1;
      return updated;
    });

    await bill.save();
    results.push({ billId: id, ok: true, linkedLines });
  }

  return NextResponse.json({ ok: true, results });
}
