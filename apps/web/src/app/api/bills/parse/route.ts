import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { matchLineToCatalog } from "@/lib/bill-normalizer";
import {
  billLineDescription,
  inferAddOnClassification,
  inferDishClassification,
  inferIngredientCategory,
  normalizeIngredientCategory,
} from "@/lib/catalog-classification";
import { validateBillFilenameForZone } from "@/lib/bill-filename";
import { applyPipelineEnrichment } from "@/lib/apply-pipeline-enrichment";
import { extractNewItemsFromBill } from "@/lib/extract-new-items";
import { connectDB } from "@/lib/mongodb";
import { persistBillFile } from "@/lib/r2-storage";
import { upsertPurchaseOrderFromBill } from "@/lib/purchase-order";
import { upsertSalesOrderFromBill } from "@/lib/sales-order";
import { BillUpload } from "@/models/BillUpload";
import { AddOn } from "@/models/AddOn";
import { Dish } from "@/models/Dish";
import { Ingredient } from "@/models/Ingredient";

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
  menuItemKind?: "dish" | "addon";
  classification?: string;
  ingredientCategory?: string;
  description?: string;
};

type ParsedBill = {
  billType: string;
  vendor: string;
  billDate: string;
  invoiceNumber: string;
  lines: ParsedLine[];
};

function classifyAddon(rawName: string): boolean {
  const lower = rawName.toLowerCase();
  return (
    /\b(add[\s-]?on|extra|side of|\+|w\/\s|with\s+extra)\b/.test(lower) ||
    lower.startsWith("+") ||
    lower.startsWith("add ")
  );
}

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
  const billTypeRaw = String(form.get("billType") ?? form.get("bill_type") ?? "supplier");
  const billType = billTypeRaw === "customer" ? "customer" : "supplier";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const filenameCheck = validateBillFilenameForZone(file.name, billType);
  if (!filenameCheck.ok) {
    return NextResponse.json({ error: filenameCheck.error }, { status: 422 });
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";

  await connectDB();
  const [ingredientRows, dishRows, addOnRows] = await Promise.all([
    Ingredient.find({ restaurantId }).select("slug name").lean(),
    Dish.find({ restaurantId }).select("slug name").lean(),
    AddOn.find({ restaurantId }).select("slug name").lean(),
  ]);

  const agentForm = new FormData();
  agentForm.append("file", new Blob([fileBuffer], { type: mimeType }), file.name);
  agentForm.append("bill_type", billType);

  type PipelineResponse = {
    bill: ParsedBill;
    enriched?: Array<{
      key: string;
      normalized_name: string;
      brand_name?: string;
      sku?: string;
      images: { url: string; label: string; source: string; score?: number }[];
    }>;
    menu_items?: Array<{ key: string; name: string; item_type: string }>;
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

  const lines =
    billType === "supplier"
      ? parsed.lines.map((line) => {
          const match = matchLineToCatalog(
            line.rawName,
            ingredientRows.map((i) => ({ slug: i.slug, name: i.name })),
            [],
            "ingredient"
          );
          const ingredientCategory = normalizeIngredientCategory(
            line.ingredientCategory || inferIngredientCategory(line.rawName)
          );
          const description =
            line.description?.trim() ||
            billLineDescription(match.normalizedName, line.rawName);
          return {
            ...line,
            suggestedCategory: "ingredient" as const,
            ingredientCategory,
            description,
            included: line.confidence >= 0.5,
            normalizedName: match.normalizedName,
            matchedIngredientSlug: match.matchedIngredientSlug,
          };
        })
      : parsed.lines.map((line) => {
          const menuItemKind = line.menuItemKind ?? (classifyAddon(line.rawName) ? "addon" : "dish");
          const catalog =
            menuItemKind === "addon"
              ? addOnRows.map((i) => ({ slug: i.slug, name: i.name }))
              : dishRows.map((i) => ({ slug: i.slug, name: i.name }));
          const match = matchLineToCatalog(line.rawName, [], catalog, "menu_item");
          const classification =
            line.classification?.trim() ||
            (menuItemKind === "addon"
              ? inferAddOnClassification(match.normalizedName, line.rawName)
              : inferDishClassification(match.normalizedName, line.rawName));
          const description =
            line.description?.trim() ||
            billLineDescription(match.normalizedName, line.rawName);
          return {
            ...line,
            suggestedCategory: "menu_item" as const,
            menuItemKind,
            classification,
            description,
            included: line.confidence >= 0.5,
            normalizedName: match.normalizedName,
            matchedMenuItemSlug: match.matchedMenuItemSlug,
            matchedDishSlug: menuItemKind === "dish" ? match.matchedMenuItemSlug : undefined,
            matchedAddOnSlug: menuItemKind === "addon" ? match.matchedMenuItemSlug : undefined,
          };
        });

  const bill = await BillUpload.create({
    restaurantId,
    userId,
    billType,
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
      billType,
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

  if (billType === "supplier") {
    await upsertPurchaseOrderFromBill(bill, userId, "parsed");
  } else {
    await upsertSalesOrderFromBill(bill, userId, "parsed");
  }

  const { ingredients: rawIngredients, dishes: rawDishes, addOns: rawAddOns } =
    extractNewItemsFromBill({
      billId: bill._id.toString(),
      filename: file.name,
      vendor: parsed.vendor,
      billType,
      lines,
    });

  const enrichedIngredients = applyPipelineEnrichment(rawIngredients, pipelineEnriched ?? []);

  return NextResponse.json({
    billId: bill._id.toString(),
    billType,
    vendor: bill.vendor,
    billDate: bill.billDate,
    invoiceNumber: bill.invoiceNumber,
    filename: bill.filename,
    fileUrl: bill.fileUrl,
    lineCount: bill.lines.length,
    lines: bill.lines,
    newCatalogItems: {
      ingredients: enrichedIngredients,
      dishes: [...rawDishes, ...rawAddOns],
      addOns: rawAddOns,
    },
    pipelineEnriched,
  });
}
