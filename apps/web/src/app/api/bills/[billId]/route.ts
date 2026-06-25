import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@backend/services/infra/auth";
import { connectDB } from "@backend/services/infra/mongodb";
import { deleteR2Object } from "@backend/services/infra/r2-storage";
import { BillUpload } from "@backend/models/BillUpload";

type RouteContext = { params: { billId: string } };

/** Remove an uploaded bill that has not been saved yet. */
export async function DELETE(_req: Request, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = (session.user as { restaurantId?: string }).restaurantId;
  const userId = session.user.id;
  if (!restaurantId || !userId) {
    return NextResponse.json({ error: "No restaurant or user" }, { status: 400 });
  }

  const { billId } = params;
  if (!billId) {
    return NextResponse.json({ error: "billId required" }, { status: 400 });
  }

  await connectDB();

  const bill = await BillUpload.findOne({ _id: billId, restaurantId, userId });
  if (!bill) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (bill.status === "confirmed") {
    return NextResponse.json(
      { error: "Processed orders cannot be removed from here" },
      { status: 400 }
    );
  }

  if (bill.fileR2Key) {
    await deleteR2Object(bill.fileR2Key);
  }

  await BillUpload.deleteOne({ _id: bill._id });

  return NextResponse.json({ ok: true, billId });
}
