import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { ingestBill } from "@/lib/bill-ingest";
import { applyPipelineEnrichment } from "@/lib/apply-pipeline-enrichment";
import { pruneOldBillUploads } from "@/lib/bill-retention";
import { extractNewItemsFromBill, mergeNewCatalogItems } from "@/lib/extract-new-items";
import { connectDB } from "@/lib/mongodb";
import { BillUpload } from "@/models/BillUpload";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = (session.user as { restaurantId?: string }).restaurantId;
  const userId = session.user.id;
  const body = await req.json();
  const billId = body.billId as string | undefined;
  const billIds = body.billIds as string[] | undefined;

  const ids = billIds?.length ? billIds : billId ? [billId] : [];
  if (!ids.length) {
    return NextResponse.json({ error: "billId or billIds required" }, { status: 400 });
  }

  await connectDB();

  const results = [];
  let totalUpdated = 0;
  let totalCreated = 0;
  let confirmed = 0;
  let failed = 0;
  let newIngredients: ReturnType<typeof extractNewItemsFromBill>["ingredients"] = [];

  for (const id of ids) {
    const bill = await BillUpload.findOne({ _id: id, restaurantId, billType: "supplier" });
    if (!bill) {
      results.push({
        billId: id,
        ok: false,
        updatedIngredients: 0,
        createdIngredients: 0,
        deductedIngredients: 0,
        message: "",
        error: "Order not found",
      });
      failed += 1;
      continue;
    }

    if (bill.status === "confirmed") {
      results.push({
        billId: id,
        ok: true,
        updatedIngredients: 0,
        createdIngredients: 0,
        deductedIngredients: 0,
        message: `${bill.filename}: already processed.`,
      });
      confirmed += 1;
      continue;
    }

    const result = await ingestBill(bill, restaurantId!);
    results.push(result);

    if (result.ok) {
      const extracted = extractNewItemsFromBill({
        billId: bill._id.toString(),
        filename: bill.filename,
        vendor: bill.vendor,
        billType: "supplier",
        lines: bill.lines,
      });
      const enrichedIngredients = applyPipelineEnrichment(
        extracted.ingredients,
        bill.pipelineEnriched ?? []
      );
      newIngredients = mergeNewCatalogItems(newIngredients, enrichedIngredients);
      confirmed += 1;
      totalUpdated += result.updatedIngredients;
      totalCreated += result.createdIngredients;
    } else {
      failed += 1;
    }
  }

  if (userId && confirmed > 0) {
    await pruneOldBillUploads(userId, "supplier");
  }

  const isBatch = ids.length > 1;
  const parts: string[] = [];
  if (totalCreated > 0) {
    parts.push(`added ${totalCreated} new ingredient${totalCreated === 1 ? "" : "s"}`);
  }
  if (totalUpdated > 0) {
    parts.push(`updated stock on ${totalUpdated} purchase order line${totalUpdated === 1 ? "" : "s"}`);
  }
  const inventoryNote = parts.length ? ` — ${parts.join("; ")}.` : ".";

  const summary =
    failed === 0
      ? isBatch
        ? `Confirmed ${confirmed} orders${inventoryNote}`
        : results[0]?.message ?? "Confirmed."
      : `Confirmed ${confirmed}/${ids.length} orders. ${failed} failed.`;

  return NextResponse.json({
    ok: failed === 0,
    billId: ids.length === 1 ? ids[0] : undefined,
    billIds: ids,
    confirmed,
    failed,
    updatedIngredients: totalUpdated,
    createdIngredients: totalCreated,
    deductedIngredients: 0,
    message: summary,
    results,
    newCatalogItems: { ingredients: newIngredients, dishes: [] },
  });
}
