import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@backend/services/infra/auth";
import { ingestBill } from "@backend/services/bills/bill-ingest";
import { applyPipelineEnrichment } from "@backend/services/bills/apply-pipeline-enrichment";
import { pruneOldBillUploads } from "@backend/services/bills/bill-retention";
import { extractNewItemsFromBill, mergeNewCatalogItems } from "@backend/services/catalog/extract-new-items";
import { connectDB } from "@backend/services/infra/mongodb";
import { BillUpload } from "@backend/models/BillUpload";

export const maxDuration = 300;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = (session.user as { restaurantId?: string }).restaurantId;
  const userId = session.user.id;
  if (!restaurantId) {
    return NextResponse.json({ error: "No restaurant" }, { status: 400 });
  }

  let body: {
    billId?: string;
    billIds?: string[];
    billType?: "supplier" | "customer";
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const billId = body.billId;
  const billIds = body.billIds;
  const billTypeFilter = body.billType;

  const ids = billIds?.length ? billIds : billId ? [billId] : [];
  if (!ids.length) {
    return NextResponse.json({ error: "billId or billIds required" }, { status: 400 });
  }

  await connectDB();

  try {
  const results = [];
  let totalUpdated = 0;
  let totalCreated = 0;
  let totalDeducted = 0;
  let confirmed = 0;
  let failed = 0;
  let newIngredients: ReturnType<typeof extractNewItemsFromBill>["ingredients"] = [];
  let newDishes: ReturnType<typeof extractNewItemsFromBill>["dishes"] = [];
  let recipeSummary: {
    dishesLinked: number;
    addOnsLinked: number;
    labels: { used: number; unused: number; missing: number };
  } | null = null;

  for (const id of ids) {
    const query: Record<string, unknown> = { _id: id, restaurantId };
    if (billTypeFilter) query.billType = billTypeFilter;

    const bill = await BillUpload.findOne(query);
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

    const result = await ingestBill(bill, restaurantId!).catch((err: unknown) => ({
      billId: id,
      ok: false as const,
      updatedIngredients: 0,
      createdIngredients: 0,
      deductedIngredients: 0,
      message: "",
      error:
        err instanceof Error
          ? err.message.includes("E11000")
            ? `${bill.filename}: an ingredient already exists — stock was not updated for this line. Try Process again.`
            : err.message
          : "Processing failed",
    }));
    results.push(result);

    if (result.ok) {
      const extracted = extractNewItemsFromBill({
        billId: bill._id.toString(),
        filename: bill.filename,
        vendor: bill.vendor,
        billType: bill.billType,
        lines: bill.lines,
      });
      const enrichedIngredients = applyPipelineEnrichment(
        extracted.ingredients,
        bill.pipelineEnriched ?? []
      );
      newIngredients = mergeNewCatalogItems(newIngredients, enrichedIngredients);
      newDishes = mergeNewCatalogItems(newDishes, [
        ...extracted.dishes,
        ...extracted.addOns,
      ]);
      if (result.recipePipeline) {
        recipeSummary = {
          dishesLinked: result.recipePipeline.dishesLinked,
          addOnsLinked: result.recipePipeline.addOnsLinked,
          labels: result.recipePipeline.labels,
        };
      }
      confirmed += 1;
      totalUpdated += result.updatedIngredients;
      totalCreated += result.createdIngredients;
      totalDeducted += result.deductedIngredients ?? 0;
    } else {
      failed += 1;
    }
  }

  if (userId && confirmed > 0) {
    const types = billTypeFilter ? [billTypeFilter] : (["supplier", "customer"] as const);
    for (const t of types) {
      await pruneOldBillUploads(userId, t);
    }
  }

  const isBatch = ids.length > 1;
  const parts: string[] = [];
  if (totalCreated > 0) {
    parts.push(`added ${totalCreated} new item${totalCreated === 1 ? "" : "s"}`);
  }
  if (totalUpdated > 0) {
    parts.push(`updated ${totalUpdated} line${totalUpdated === 1 ? "" : "s"}`);
  }
  if (recipeSummary) {
    const { dishesLinked, addOnsLinked, labels } = recipeSummary;
    if (dishesLinked || addOnsLinked) {
      parts.push(
        `linked ${dishesLinked} dish${dishesLinked === 1 ? "" : "es"} and ${addOnsLinked} add-on${addOnsLinked === 1 ? "" : "s"} to pantry`
      );
    }
    if (labels.used || labels.unused || labels.missing) {
      parts.push(
        `labels: ${labels.used} used, ${labels.unused} unused, ${labels.missing} missing`
      );
    }
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
    deductedIngredients: totalDeducted,
    message: summary,
    results,
    recipeSummary,
    newCatalogItems: { ingredients: newIngredients, dishes: newDishes },
  });
  } catch (err) {
    console.error("[bills/confirm]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Processing failed — try fewer orders or check the agent service is running.",
        ok: false,
      },
      { status: 500 }
    );
  }
}
