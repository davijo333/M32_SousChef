import type { HydratedDocument } from "mongoose";
import type { IBillLine, IBillUpload } from "@/models/BillUpload";
import { PurchaseOrder, type IPurchaseOrderItem } from "@/models/PurchaseOrder";

export function generatePoId(billUploadId: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = billUploadId.slice(-6).toUpperCase();
  return `PO-${date}-${suffix}`;
}

function parseBillDate(billDate?: string): Date | undefined {
  if (!billDate?.trim()) return undefined;
  const parsed = new Date(billDate);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function billLinesToPoItems(lines: IBillLine[]): IPurchaseOrderItem[] {
  return lines
    .filter((line) => line.included && line.suggestedCategory === "ingredient")
    .map((line) => ({
      name: (line.normalizedName ?? line.rawName).trim(),
      price: line.unitPrice,
      qty: line.quantity,
      unit: line.unit || undefined,
      ingredientSlug: line.matchedIngredientSlug,
    }));
}

export async function upsertPurchaseOrderFromBill(
  bill: HydratedDocument<IBillUpload>,
  userId: string,
  status: "parsed" | "processed" = "parsed"
): Promise<void> {
  const poId = generatePoId(bill._id.toString());
  const items = billLinesToPoItems(bill.lines);
  const purchaseDate = parseBillDate(bill.billDate);

  const storeName = bill.vendor?.trim() || undefined;

  await PurchaseOrder.findOneAndUpdate(
    { billUploadId: bill._id },
    {
      restaurantId: bill.restaurantId,
      userId,
      billUploadId: bill._id,
      poId,
      filename: bill.filename,
      storeName,
      vendor: storeName,
      purchaseDate,
      uploadDate: bill.createdAt ?? new Date(),
      status,
      items,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}