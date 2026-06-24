import type { PipelineEnrichedRow } from "@/lib/apply-pipeline-enrichment";
import {
  applyIngredientStockUpdate,
  buildIngredientSku,
  findExistingIngredient,
} from "@/lib/ingredient-identity";
import {
  applyIngredientEnrichment,
  buildEnrichmentMap,
  lookupLineEnrichment,
} from "@/lib/ingredient-enrichment";
import type { IBillLine, IBillUpload } from "@/models/BillUpload";
import { BillUpload } from "@/models/BillUpload";
import { Ingredient } from "@/models/Ingredient";

export type IngestResult = {
  billId: string;
  ok: boolean;
  updatedIngredients: number;
  createdIngredients: number;
  deductedIngredients: number;
  message: string;
  error?: string;
};

type BillLineMutable = IBillLine & { stockApplied?: boolean };

export type SupplierLineIngestResult = { updated: boolean; created: boolean };

function ingredientSlugFromName(name: string): string {
  return `ing-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

function isSkippableSupplierLine(name: string): boolean {
  const n = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return !n || n === "tax" || n === "tip" || n === "total" || n === "subtotal";
}

export async function ingestSupplierLine(
  restaurantId: string,
  line: BillLineMutable,
  vendor?: string,
  pipelineEnriched?: PipelineEnrichedRow[]
): Promise<SupplierLineIngestResult> {
  if (line.stockApplied) return { updated: false, created: false };
  if (!line.included || line.suggestedCategory !== "ingredient") {
    return { updated: false, created: false };
  }

  const enrichmentMap = buildEnrichmentMap(pipelineEnriched);
  const rowEnrichment = lookupLineEnrichment(line.rawName, enrichmentMap);
  const enrichedName = rowEnrichment?.normalized_name?.trim();
  const enrichedBrand = rowEnrichment?.brand_name?.trim();

  let name = (line.normalizedName ?? enrichedName ?? line.rawName).trim();
  if (enrichedName && !line.matchedIngredientSlug) {
    name = enrichedName;
    line.normalizedName = enrichedName;
  }
  if (isSkippableSupplierLine(name)) return { updated: false, created: false };

  const brandName = enrichedBrand || undefined;
  const unit = line.unit || "each";
  const identity = {
    brandName,
    name,
    inventoryUnit: unit,
    rawName: line.rawName,
  };
  const sku =
    rowEnrichment?.sku?.trim() || buildIngredientSku(identity);

  let ing =
    line.matchedIngredientSlug
      ? await Ingredient.findOne({ restaurantId, slug: line.matchedIngredientSlug })
      : null;

  if (!ing) {
    ing = await findExistingIngredient(restaurantId, { ...identity, sku });
    if (ing) {
      line.matchedIngredientSlug = ing.slug;
      line.normalizedName = ing.name;
    }
  }

  if (ing) {
    if (enrichedBrand) ing.brandName = enrichedBrand;
    if (enrichedName && !line.matchedIngredientSlug) ing.name = enrichedName;
    applyIngredientStockUpdate(ing, {
      addQty: line.quantity,
      unitPrice: line.unitPrice,
      orderedQty: line.quantity,
      brandName,
      sku,
    });
    await applyIngredientEnrichment(ing, rowEnrichment, line.rawName);
    if (!ing.sku) ing.sku = sku;
    await ing.save();
    line.matchedIngredientSlug = ing.slug;
    line.stockApplied = true;
    return { updated: true, created: false };
  }

  const slug = ingredientSlugFromName(name);
  const created = await Ingredient.create({
    restaurantId,
    slug,
    sku,
    name,
    category: "misc",
    inventoryUnit: unit,
    currentQty: line.quantity,
    reorderThreshold: 1,
    lastPurchasePrice: line.unitPrice > 0 ? line.unitPrice : undefined,
    lastOrderedQty: line.quantity > 0 ? line.quantity : undefined,
    brandName,
    source: "bill_upload",
    selectedImageIndex: 0,
    usageUnits: [{ unit, countPerInventoryUnit: 1 }],
  });

  await applyIngredientEnrichment(created, rowEnrichment, line.rawName);
  await created.save();

  line.matchedIngredientSlug = slug;
  line.normalizedName = name;
  line.stockApplied = true;
  return { updated: false, created: true };
}

export async function applySupplierLineStock(
  restaurantId: string,
  line: BillLineMutable,
  vendor?: string
): Promise<boolean> {
  const result = await ingestSupplierLine(restaurantId, line, vendor);
  return result.updated || result.created;
}

export async function reconcileKitchenInventory(restaurantId: string): Promise<void> {
  const bills = await BillUpload.find({
    restaurantId,
    billType: "supplier",
    status: "confirmed",
  }).sort({ createdAt: 1 });

  for (const bill of bills) {
    let dirty = false;
    const lines = bill.lines as BillLineMutable[];
    for (const line of lines) {
      const result = await ingestSupplierLine(
        restaurantId,
        line,
        bill.vendor,
        bill.pipelineEnriched
      );
      if (result.updated || result.created) dirty = true;
    }
    if (dirty) {
      bill.markModified("lines");
      await bill.save();
    }
  }
}
