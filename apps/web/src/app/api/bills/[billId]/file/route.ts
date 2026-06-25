import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@backend/services/infra/auth";
import { connectDB } from "@backend/services/infra/mongodb";
import { readBillFileBuffer } from "@backend/services/infra/r2-storage";
import { BillUpload } from "@backend/models/BillUpload";

type RouteContext = { params: { billId: string } };

/** Stream an uploaded bill PDF or image for the signed-in owner. */
export async function GET(_req: Request, { params }: RouteContext) {
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

  const bill = await BillUpload.findOne({ _id: billId, restaurantId, userId }).lean();
  if (!bill?.fileR2Key) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  try {
    const { data, contentType } = await readBillFileBuffer(bill.fileR2Key);
    const inline = contentType === "application/pdf" || contentType.startsWith("image/");
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${bill.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
