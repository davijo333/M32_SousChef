import { deleteR2Object } from "@/lib/r2-storage";
import { BillUpload } from "@/models/BillUpload";

export const MAX_BILLS_PER_TYPE = 5;

/** Drop oldest confirmed uploads beyond the limit. Pending bills are kept until confirmed. */
export async function pruneOldBillUploads(
  userId: string,
  billType: "supplier" | "customer"
): Promise<void> {
  const excess = await BillUpload.find({ userId, billType, status: "confirmed" })
    .sort({ createdAt: -1 })
    .skip(MAX_BILLS_PER_TYPE)
    .select("_id fileR2Key")
    .lean();

  for (const bill of excess) {
    if (bill.fileR2Key) {
      try {
        await deleteR2Object(bill.fileR2Key);
      } catch {
        // File may already be gone
      }
    }
    await BillUpload.deleteOne({ _id: bill._id });
  }
}
