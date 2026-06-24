export type BillFileType = "supplier" | "customer";

/** Detect bill type from standard test/production filenames like `1.c_bill.pdf` or `2.s_bill.png`. */
export function detectBillTypeFromFilename(filename: string): BillFileType | null {
  const lower = filename.toLowerCase();
  const isCustomer = /\.c_bill\./.test(lower) || /[_-]c_bill[._-]/.test(lower);
  const isSupplier = /\.s_bill\./.test(lower) || /[_-]s_bill[._-]/.test(lower);

  if (isCustomer && !isSupplier) return "customer";
  if (isSupplier && !isCustomer) return "supplier";
  return null;
}

export function billTypeLabel(type: BillFileType): string {
  return type === "supplier" ? "purchase order" : "sales order";
}

export function validateBillFilenameForZone(
  filename: string,
  expected: BillFileType
): { ok: true } | { ok: false; error: string } {
  const detected = detectBillTypeFromFilename(filename);
  if (!detected || detected === expected) return { ok: true };

  const expectedLabel = billTypeLabel(expected);
  const detectedLabel = billTypeLabel(detected);

  return {
    ok: false,
    error: `"${filename}" is a ${detectedLabel} — upload it under ${expectedLabel}s instead.`,
  };
}

export function billTypeMismatchError(
  detected: BillFileType,
  expected: BillFileType
): string {
  return `This file looks like a ${billTypeLabel(detected)}, not a ${billTypeLabel(expected)}. Upload it in the correct column.`;
}
