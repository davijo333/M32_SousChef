import fs from "fs";
import path from "path";
import { formatSeedOrderDate, resolveSeedOrderDate } from "@/lib/seed-order-dates";
import { BillUpload } from "@/models/BillUpload";
import { PurchaseOrder } from "@/models/PurchaseOrder";
import { SalesOrder } from "@/models/SalesOrder";

const SEED_FILENAME_PREFIX = "seed://";

function resolveInventoryRoot(): string {
  const candidates = [
    path.join(process.cwd(), "test/inventory"),
    path.join(process.cwd(), "../../test/inventory"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "sales-orders.json"))) return candidate;
  }
  throw new Error("Could not find test/inventory (sales-orders.json)");
}

function loadJson<T>(filename: string): T {
  const filePath = path.join(resolveInventoryRoot(), filename);
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

type SeedSalesLine = {
  dishSlug?: string;
  addOnSlug?: string;
  posName?: string;
  qty: number;
  unitPrice: number;
};

type SeedSalesOrder = {
  id: string;
  date?: string;
  daysAgo?: number;
  seedDay?: number;
  billDay?: number;
  title: string;
  lines: SeedSalesLine[];
};

type SeedPurchaseLine = {
  description: string;
  qty: number;
  unitPrice: number;
  ingredientSlugs?: string[];
};

type SeedPurchaseOrder = {
  id: string;
  vendor: string;
  date?: string;
  daysAgo?: number;
  seedDay?: number;
  billDay?: number;
  title: string;
  lines: SeedPurchaseLine[];
};

function seedFilename(kind: "sales" | "purchase", orderId: string): string {
  return `${SEED_FILENAME_PREFIX}${kind}/${orderId}`;
}

export async function clearSeededOrders(restaurantId: string): Promise<void> {
  const seedBills = await BillUpload.find({
    restaurantId,
    filename: { $regex: `^${SEED_FILENAME_PREFIX}` },
  })
    .select("_id")
    .lean();

  const billIds = seedBills.map((bill) => bill._id);
  await Promise.all([
    SalesOrder.deleteMany({ restaurantId, billUploadId: { $in: billIds } }),
    PurchaseOrder.deleteMany({ restaurantId, billUploadId: { $in: billIds } }),
    BillUpload.deleteMany({ _id: { $in: billIds } }),
  ]);
}

export type SeedOrdersResult = {
  salesOrders: number;
  purchaseOrders: number;
};

export async function seedKitchenOrders(
  restaurantId: string,
  userId: string
): Promise<SeedOrdersResult> {
  const salesDoc = loadJson<{ posVendor?: string; salesOrders: SeedSalesOrder[] }>(
    "sales-orders.json"
  );
  const purchaseDoc = loadJson<{ purchaseOrders: SeedPurchaseOrder[] }>("purchase-orders.json");

  await clearSeededOrders(restaurantId);

  for (const order of salesDoc.salesOrders) {
    const uploadDate = resolveSeedOrderDate(order);
    const billDate = formatSeedOrderDate(uploadDate);
    const bill = await BillUpload.create({
      restaurantId,
      userId,
      billType: "customer",
      vendor: salesDoc.posVendor ?? "Square POS",
      billDate,
      filename: seedFilename("sales", order.id),
      status: "confirmed",
      lines: order.lines.map((line) => {
        const isAddOn = Boolean(line.addOnSlug);
        const name = line.posName ?? line.dishSlug ?? line.addOnSlug ?? "Item";
        return {
          rawName: name,
          normalizedName: name,
          quantity: line.qty,
          unit: "each",
          unitPrice: line.unitPrice,
          lineTotal: line.qty * line.unitPrice,
          confidence: 1,
          suggestedCategory: "menu_item" as const,
          included: true,
          matchedDishSlug: line.dishSlug,
          matchedAddOnSlug: line.addOnSlug,
          menuItemKind: isAddOn ? ("addon" as const) : ("dish" as const),
        };
      }),
      createdAt: uploadDate,
      updatedAt: uploadDate,
    });

    await SalesOrder.create({
      restaurantId,
      userId,
      billUploadId: bill._id,
      soId: order.id,
      filename: bill.filename,
      vendor: salesDoc.posVendor,
      saleDate: uploadDate,
      uploadDate,
      status: "processed",
      items: order.lines.map((line) => ({
        name: line.posName ?? line.dishSlug ?? line.addOnSlug ?? "Item",
        price: line.unitPrice,
        qty: line.qty,
        unit: "each",
        dishSlug: line.dishSlug,
        addOnSlug: line.addOnSlug,
        itemKind: line.addOnSlug ? ("addon" as const) : ("dish" as const),
      })),
      createdAt: uploadDate,
      updatedAt: uploadDate,
    });
  }

  for (const order of purchaseDoc.purchaseOrders) {
    const uploadDate = resolveSeedOrderDate(order);
    const billDate = formatSeedOrderDate(uploadDate);
    const bill = await BillUpload.create({
      restaurantId,
      userId,
      billType: "supplier",
      vendor: order.vendor,
      billDate,
      filename: seedFilename("purchase", order.id),
      status: "confirmed",
      lines: order.lines.map((line) => ({
        rawName: line.description,
        normalizedName: line.description,
        quantity: line.qty,
        unit: "case",
        unitPrice: line.unitPrice,
        lineTotal: line.qty * line.unitPrice,
        confidence: 1,
        suggestedCategory: "ingredient" as const,
        included: true,
        matchedIngredientSlug: line.ingredientSlugs?.[0],
      })),
      createdAt: uploadDate,
      updatedAt: uploadDate,
    });

    await PurchaseOrder.create({
      restaurantId,
      userId,
      billUploadId: bill._id,
      poId: order.id,
      filename: bill.filename,
      storeName: order.vendor,
      vendor: order.vendor,
      purchaseDate: uploadDate,
      uploadDate,
      status: "processed",
      items: order.lines.map((line) => ({
        name: line.description,
        price: line.unitPrice,
        qty: line.qty,
        unit: "case",
        ingredientSlug: line.ingredientSlugs?.[0],
      })),
      createdAt: uploadDate,
      updatedAt: uploadDate,
    });
  }

  return {
    salesOrders: salesDoc.salesOrders.length,
    purchaseOrders: purchaseDoc.purchaseOrders.length,
  };
}
