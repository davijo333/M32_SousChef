import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { matchLineToCatalog } from "@/lib/bill-normalizer";
import { validateBillFilenameForZone } from "@/lib/bill-filename";
import { applyPipelineEnrichment } from "@/lib/apply-pipeline-enrichment";
import { extractNewItemsFromBill } from "@/lib/extract-new-items";
import { connectDB } from "@/lib/mongodb";
import { persistBillFile } from "@/lib/r2-storage";
import { BillUpload } from "@/models/BillUpload";
import { Ingredient } from "@/models/Ingredient";
import { upsertPurchaseOrderFromBill } from "@/lib/purchase-order";

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";
const PARSE_AGENT_TIMEOUT_MS = 180_000;

export const maxDuration = 120;

type ParsedLine = {
  rawName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  confidence: number;
  suggestedCategory: "ingredient" | "menu_item";
};

type ParsedBill = {
  billType: string;
  vendor: string;
  billDate: string;
  invoiceNumber: string;
  lines: ParsedLine[];
};

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = (session.user as { restaurantId?: string }).restaurantId;
  const userId = session.user.id;
  if (!restaurantId || !userId) {
    return NextResponse.json({ error: "No restaurant or user" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const filenameCheck = validateBillFilenameForZone(file.name, "supplier");
  if (!filenameCheck.ok) {
    return NextResponse.json({ error: filenameCheck.error }, { status: 422 });
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";

  await connectDB();
  const ingredientRows = await Ingredient.find({ restaurantId }).select("slug name").lean();

  const agentForm = new FormData();
  agentForm.append("file", new Blob([fileBuffer], { type: mimeType }), file.name);
  agentForm.append("bill_type", "supplier");

  type PipelineResponse = {
    bill: ParsedBill;
    enriched?: Array<{
      key: string;
      normalized_name: string;
      brand_name?: string;
      sku?: string;
      images: { url: string; label: string; source: string; score?: number }[];
    }>;
  };

  let parsed: ParsedBill;
  let pipelineEnriched: PipelineResponse["enriched"] = [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PARSE_AGENT_TIMEOUT_MS);
    const agentRes = await fetch(`${AGENT_URL}/parse-bill-pipeline`, {
      method: "POST",
      body: agentForm,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!agentRes.ok) {
      const err = await agentRes.text();
      return NextResponse.json({ error: `Agent parse failed: ${err}` }, { status: 502 });
    }
    const pipeline = (await agentRes.json()) as PipelineResponse;
    parsed = pipeline.bill;
    pipelineEnriched = pipeline.enriched ?? [];
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      {
        error: timedOut
          ? "Order read timed out. Try fewer files or check the agent service."
          : `Agent unreachable at ${AGENT_URL}. Run: npm run start:agents`,
      },
      { status: timedOut ? 504 : 503 }
    );
  }

  const lines = parsed.lines.map((line) => {
    const match = matchLineToCatalog(
      line.rawName,
      ingredientRows.map((i) => ({ slug: i.slug, name: i.name })),
      [],
      "ingredient"
    );
    return {
      ...line,
      suggestedCategory: "ingredient" as const,
      included: line.confidence >= 0.5,
      normalizedName: match.normalizedName,
      matchedIngredientSlug: match.matchedIngredientSlug,
    };
  });

  const bill = await BillUpload.create({
    restaurantId,
    userId,
    billType: "supplier",
    vendor: parsed.vendor,
    billDate: parsed.billDate || undefined,
    invoiceNumber: parsed.invoiceNumber || undefined,
    filename: file.name,
    mimeType,
    status: "pending_review",
    lines,
    pipelineEnriched: pipelineEnriched ?? [],
  });

  try {
    const stored = await persistBillFile(
      userId,
      "supplier",
      bill._id.toString(),
      fileBuffer,
      file.name,
      mimeType
    );
    bill.fileR2Key = stored.r2Key;
    bill.fileUrl = stored.publicUrl;
    await bill.save();
  } catch {
    // best-effort
  }

  await upsertPurchaseOrderFromBill(bill, userId, "parsed");

  const { ingredients: rawIngredients } = extractNewItemsFromBill({
    billId: bill._id.toString(),
    filename: file.name,
    vendor: parsed.vendor,
    billType: "supplier",
    lines,
  });

  const enrichedIngredients = applyPipelineEnrichment(rawIngredients, pipelineEnriched ?? []);

  return NextResponse.json({
    billId: bill._id.toString(),
    billType: "supplier",
    vendor: bill.vendor,
    billDate: bill.billDate,
    invoiceNumber: bill.invoiceNumber,
    filename: bill.filename,
    fileUrl: bill.fileUrl,
    lineCount: bill.lines.length,
    lines: bill.lines,
    newCatalogItems: { ingredients: enrichedIngredients, dishes: [] },
    pipelineEnriched,
  });
}
