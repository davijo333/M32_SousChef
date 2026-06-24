import type { HydratedDocument } from "mongoose";
import type { IBillUpload } from "@/models/BillUpload";
import type { ParsedBillLine } from "@/lib/extract-new-items";
import { ingestSupplierLine, type IngestResult } from "@/lib/kitchen-inventory";
import {
  upsertPurchaseOrderFromBill,
} from "@/lib/purchase-order";
import { supplierBillIngestMessage } from "@/lib/supplier-ingest";

export type { IngestResult };

export async function ingestBill(
  bill: HydratedDocument<IBillUpload>,
  restaurantId: string
): Promise<IngestResult> {
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

  if (bill.billType !== "supplier") {
    return {
      billId,
      ok: false,
      updatedIngredients: 0,
      createdIngredients: 0,
      deductedIngredients: 0,
      message: "",
      error: "Only purchase orders are supported",
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

  return {
    billId,
    ok: true,
    updatedIngredients,
    createdIngredients,
    deductedIngredients: 0,
    message: supplierBillIngestMessage(
      bill.filename,
      updatedIngredients,
      createdIngredients,
      bill.lines as ParsedBillLine[]
    ),
  };
}
