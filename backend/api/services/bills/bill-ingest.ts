import type { HydratedDocument } from "mongoose";
import type { IBillUpload } from "@backend/models/BillUpload";
import type { ParsedBillLine } from "@backend/services/catalog/extract-new-items";
import { ingestCustomerBill } from "@backend/services/catalog/dish-catalog";
import { ensureDishImages } from "@backend/services/catalog/ensure-dish-images";
import { ensureAddOnImages } from "@backend/services/catalog/ensure-addon-images";
import { ingestSupplierLine, type IngestResult } from "@backend/services/infra/kitchen-inventory";
import { runRecipePipeline } from "@backend/services/recipes/recipe-pipeline";
import { upsertPurchaseOrderFromBill } from "@backend/services/orders/purchase-order";
import { upsertSalesOrderFromBill } from "@backend/services/orders/sales-order";
import { supplierBillIngestMessage } from "@backend/services/orders/supplier-ingest";

export type { IngestResult };

export async function ingestBill(
  bill: HydratedDocument<IBillUpload>,
  restaurantId: string
): Promise<IngestResult & { recipePipeline?: Awaited<ReturnType<typeof runRecipePipeline>> }> {
  const billId = bill._id.toString();

  if (bill.status !== "pending_review") {
    return {
      billId,
      ok: false,
      updatedIngredients: 0,
      createdIngredients: 0,
      deductedIngredients: 0,
      message: "",
      error: "Bill already processed",
    };
  }

  if (bill.billType === "customer") {
    const lines = bill.lines as Array<
      (typeof bill.lines)[number] & { stockApplied?: boolean }
    >;
    const stats = await ingestCustomerBill(restaurantId, lines);
    await ensureDishImages(restaurantId);
    await ensureAddOnImages(restaurantId);
    bill.status = "confirmed";
    bill.markModified("lines");
    await bill.save();
    await upsertSalesOrderFromBill(bill, bill.userId?.toString() ?? "", "processed");

    const recipePipeline = await runRecipePipeline(restaurantId);

    const parts: string[] = [];
    if (stats.dishesCreated) parts.push(`${stats.dishesCreated} new dish${stats.dishesCreated === 1 ? "" : "es"}`);
    if (stats.addOnsCreated) parts.push(`${stats.addOnsCreated} new add-on${stats.addOnsCreated === 1 ? "" : "s"}`);
    if (stats.dishesUpdated) parts.push(`${stats.dishesUpdated} dish${stats.dishesUpdated === 1 ? "" : "es"} updated`);
    if (stats.addOnsUpdated) parts.push(`${stats.addOnsUpdated} add-on${stats.addOnsUpdated === 1 ? "" : "s"} updated`);
    if (stats.ingredientsDeducted) {
      parts.push(`deducted pantry for ${stats.ingredientsDeducted} recipe line${stats.ingredientsDeducted === 1 ? "" : "s"}`);
    }
    if (recipePipeline.dishesLinked || recipePipeline.addOnsLinked) {
      parts.push(
        `linked ${recipePipeline.dishesLinked} dish${recipePipeline.dishesLinked === 1 ? "" : "es"} and ${recipePipeline.addOnsLinked} add-on${recipePipeline.addOnsLinked === 1 ? "" : "s"} to pantry`
      );
    }

    return {
      billId,
      ok: true,
      updatedIngredients: stats.dishesUpdated + stats.addOnsUpdated,
      createdIngredients: stats.dishesCreated + stats.addOnsCreated,
      deductedIngredients: stats.ingredientsDeducted,
      recipePipeline,
      message: parts.length
        ? `${bill.filename}: ${parts.join(", ")}.`
        : `${bill.filename}: no menu changes.`,
    };
  }

  if (bill.billType !== "supplier") {
    return {
      billId,
      ok: false,
      updatedIngredients: 0,
      createdIngredients: 0,
      deductedIngredients: 0,
      message: "",
      error: "Unsupported bill type",
    };
  }

  let updatedIngredients = 0;
  let createdIngredients = 0;
  const lines = bill.lines as Array<
    (typeof bill.lines)[number] & { stockApplied?: boolean }
  >;

  for (const line of lines) {
    const result = await ingestSupplierLine(
      restaurantId,
      line,
      bill.vendor,
      bill.pipelineEnriched
    );
    if (result.created) createdIngredients += 1;
    else if (result.updated) updatedIngredients += 1;
  }

  bill.status = "confirmed";
  bill.markModified("lines");
  await bill.save();

  await upsertPurchaseOrderFromBill(bill, bill.userId?.toString() ?? "", "processed");

  const recipePipeline = await runRecipePipeline(restaurantId);

  return {
    billId,
    ok: true,
    updatedIngredients,
    createdIngredients,
    deductedIngredients: 0,
    recipePipeline,
    message: supplierBillIngestMessage(
      bill.filename,
      updatedIngredients,
      createdIngredients,
      bill.lines as ParsedBillLine[]
    ),
  };
}
