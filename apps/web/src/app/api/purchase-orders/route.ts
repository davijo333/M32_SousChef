import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { PurchaseOrder } from "@/models/PurchaseOrder";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = (session.user as { restaurantId?: string }).restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "No restaurant" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "processed";

  await connectDB();

  const filter: Record<string, unknown> = { restaurantId };
  if (status === "processed" || status === "parsed") {
    filter.status = status;
  }

  const orders = await PurchaseOrder.find(filter)
    .sort({ uploadDate: -1 })
    .lean();

  return NextResponse.json({
    orders: orders.map((po) => ({
      poId: po.poId,
      filename: po.filename,
      storeName: po.storeName ?? po.vendor,
      vendor: po.vendor,
      purchaseDate: po.purchaseDate?.toISOString() ?? null,
      uploadDate: po.uploadDate.toISOString(),
      status: po.status,
      billUploadId: po.billUploadId.toString(),
      items: po.items.map((item) => ({
        name: item.name,
        price: item.price,
        qty: item.qty,
        unit: item.unit,
      })),
    })),
  });
}
