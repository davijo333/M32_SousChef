import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { extractNewItemsFromBill, mergeNewCatalogItems } from "@/lib/extract-new-items";
import { connectDB } from "@/lib/mongodb";
import { BillUpload } from "@/models/BillUpload";

function formatBill(bill: {
  _id: { toString(): string };
  vendor: string;
  billDate?: string;
  invoiceNumber?: string;
  filename: string;
  fileUrl?: string;
  status: string;
  lines: unknown[];
  createdAt: Date;
}) {
  return {
    billId: bill._id.toString(),
    vendor: bill.vendor,
    billDate: bill.billDate,
    invoiceNumber: bill.invoiceNumber,
    filename: bill.filename,
    fileUrl: bill.fileUrl,
    status: bill.status,
    lineCount: bill.lines.length,
    lines: bill.lines,
    uploadDate: bill.createdAt.toISOString().slice(0, 10),
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  if (!userId) {
    return NextResponse.json({ error: "No user" }, { status: 400 });
  }

  await connectDB();

  async function billsForType(billType: "supplier" | "customer") {
    const [pending, recent] = await Promise.all([
      BillUpload.find({ userId, billType, status: "pending_review" })
        .sort({ createdAt: -1 })
        .lean(),
      BillUpload.find({ userId, billType }).sort({ createdAt: -1 }).limit(5).lean(),
    ]);
    const byId = new Map<string, (typeof pending)[number]>();
    for (const bill of [...pending, ...recent]) {
      byId.set(bill._id.toString(), bill);
    }
    return Array.from(byId.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  const [supplierBills, customerBills] = await Promise.all([
    billsForType("supplier"),
    billsForType("customer"),
  ]);

  const confirmedBillIds = [
    ...supplierBills.filter((b) => b.status === "confirmed"),
    ...customerBills.filter((b) => b.status === "confirmed"),
  ].map((b) => b._id.toString());

  let newIngredients: ReturnType<typeof extractNewItemsFromBill>["ingredients"] = [];
  let newDishes: ReturnType<typeof extractNewItemsFromBill>["dishes"] = [];

  for (const bill of supplierBills.filter((b) => b.status === "confirmed")) {
    const extracted = extractNewItemsFromBill({
      billId: bill._id.toString(),
      filename: bill.filename,
      vendor: bill.vendor,
      billType: "supplier",
      lines: bill.lines,
    });
    newIngredients = mergeNewCatalogItems(newIngredients, extracted.ingredients);
  }

  for (const bill of customerBills.filter((b) => b.status === "confirmed")) {
    const extracted = extractNewItemsFromBill({
      billId: bill._id.toString(),
      filename: bill.filename,
      vendor: bill.vendor,
      billType: "customer",
      lines: bill.lines,
    });
    newDishes = mergeNewCatalogItems(newDishes, [...extracted.dishes, ...extracted.addOns]);
  }

  const byDate: Record<string, { supplier: ReturnType<typeof formatBill>[]; customer: ReturnType<typeof formatBill>[] }> = {};
  for (const bill of [...supplierBills, ...customerBills]) {
    const date = bill.createdAt.toISOString().slice(0, 10);
    if (!byDate[date]) byDate[date] = { supplier: [], customer: [] };
    const key = bill.billType === "customer" ? "customer" : "supplier";
    byDate[date][key].push(formatBill(bill));
  }

  return NextResponse.json({
    supplier: supplierBills.map(formatBill),
    customer: customerBills.map(formatBill),
    byDate,
    confirmedBillIds,
    newCatalogItems: { ingredients: newIngredients, dishes: newDishes },
  });
}
