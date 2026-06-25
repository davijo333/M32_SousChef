import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@backend/services/infra/auth";
import { connectDB } from "@backend/services/infra/mongodb";
import { SalesOrder } from "@backend/models/SalesOrder";

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
  const statusParam = searchParams.get("status") ?? "processed";
  const status = statusParam === "parsed" ? "parsed" : "processed";

  await connectDB();

  const orders = await SalesOrder.find({ restaurantId, status })
    .sort({ uploadDate: -1 })
    .limit(50)
    .lean();

  return NextResponse.json({
    orders: orders.map((o) => ({
      soId: o.soId,
      filename: o.filename,
      vendor: o.vendor,
      saleDate: o.saleDate?.toISOString() ?? null,
      uploadDate: o.uploadDate.toISOString(),
      status: o.status,
      billUploadId: o.billUploadId.toString(),
      items: o.items,
    })),
  });
}
