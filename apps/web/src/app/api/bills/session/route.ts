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

  const supplierBills = await BillUpload.find({ userId, billType: "supplier" })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  const confirmedBillIds = supplierBills
    .filter((b) => b.status === "confirmed")
    .map((b) => b._id.toString());

  let newIngredients: ReturnType<typeof extractNewItemsFromBill>["ingredients"] = [];

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

  const byDate: Record<string, { supplier: ReturnType<typeof formatBill>[] }> = {};
  for (const bill of supplierBills) {
    const date = bill.createdAt.toISOString().slice(0, 10);
    if (!byDate[date]) byDate[date] = { supplier: [] };
    byDate[date].supplier.push(formatBill(bill));
  }

  return NextResponse.json({
    supplier: supplierBills.map(formatBill),
    byDate,
    confirmedBillIds,
    newCatalogItems: { ingredients: newIngredients, dishes: [] },
  });
}
