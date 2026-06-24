import type { ParsedBillLine } from "@/lib/extract-new-items";

export function supplierBillIngestMessage(
  filename: string,
  updatedLines: number,
  createdLines: number,
  lines: ParsedBillLine[]
): string {
  const applied = updatedLines + createdLines;
  if (applied > 0) {
    const parts: string[] = [];
    if (createdLines > 0) {
      parts.push(
        `added ${createdLines} new ingredient${createdLines === 1 ? "" : "s"}`
      );
    }
    if (updatedLines > 0) {
      parts.push(
        `updated stock on ${updatedLines} line${updatedLines === 1 ? "" : "s"}`
      );
    }
    return `${filename}: ${parts.join(", ")}.`;
  }

  const ingredientLines = lines.filter((l) => l.suggestedCategory === "ingredient");
  const excluded = ingredientLines.filter((l) => !l.included).length;
  if (ingredientLines.length === 0) {
    return `${filename}: saved — no product lines detected on this order.`;
  }
  if (excluded === ingredientLines.length) {
    return `${filename}: saved — ${excluded} line(s) skipped (low confidence). Expand the order to include them.`;
  }
  return `${filename}: saved — no stock changes applied.`;
}
