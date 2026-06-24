import type { HydratedDocument } from "mongoose";
import type { IBillLine, IBillUpload } from "@/models/BillUpload";
import { SalesOrder, type ISalesOrderItem } from "@/models/SalesOrder";

export function generateSoId(billUploadId: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = billUploadId.slice(-6).toUpperCase();
  return `SO-${date}-${suffix}`;
}

function parseBillDate(billDate?: string): Date | undefined {
  if (!billDate?.trim()) return undefined;
  const parsed = new Date(billDate);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function billLinesToSoItems(lines: IBillLine[]): ISalesOrderItem[] {
  return lines
    .filter((line) => line.included && line.suggestedCategory === "menu_item")
    .map((line) => {
      const kind = line.menuItemKind ?? "dish";
      return {
        name: (line.normalizedName ?? line.rawName).trim(),
        price: line.unitPrice,
        qty: line.quantity,
        unit: line.unit || undefined,
        dishSlug: kind === "dish" ? line.matchedDishSlug : undefined,
        addOnSlug: kind === "addon" ? line.matchedAddOnSlug : undefined,
        itemKind: kind,
      };
    });
}

export async function upsertSalesOrderFromBill(
  bill: HydratedDocument<IBillUpload>,
  userId: string,
  status: "parsed" | "processed" = "parsed"
): Promise<void> {
  const soId = generateSoId(bill._id.toString());
  const items = billLinesToSoItems(bill.lines);
  const saleDate = parseBillDate(bill.billDate);

  await SalesOrder.findOneAndUpdate(
    { billUploadId: bill._id },
    {
      restaurantId: bill.restaurantId,
      userId,
      billUploadId: bill._id,
      soId,
      filename: bill.filename,
      vendor: bill.vendor?.trim() || undefined,
      saleDate,
      uploadDate: bill.createdAt ?? new Date(),
      status,
      items,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}
