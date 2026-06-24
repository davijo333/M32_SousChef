export type BillFileType = "supplier" | "customer";

const ALLOWED_BILL_EXTENSIONS = /\.(pdf|png|jpe?g)$/i;

/** Legacy test markers — optional; real wholesaler/POS filenames do not need these. */
export function detectBillTypeFromFilename(filename: string): BillFileType | null {
  const lower = filename.toLowerCase();
  const isCustomer = /\.c_bill\./.test(lower) || /[_-]c_bill[._-]/.test(lower);
  const isSupplier = /\.s_bill\./.test(lower) || /[_-]s_bill[._-]/.test(lower);

  if (isCustomer && !isSupplier) return "customer";
  if (isSupplier && !isCustomer) return "supplier";
  return null;
}

export function isAllowedBillFileExtension(filename: string): boolean {
  return ALLOWED_BILL_EXTENSIONS.test(filename.trim());
}

export function billTypeLabel(type: BillFileType): string {
  return type === "supplier" ? "purchase order" : "sales order";
}

export function validateBillFilenameForZone(
  filename: string,
  expected: BillFileType
): { ok: true } | { ok: false; error: string } {
  if (!isAllowedBillFileExtension(filename)) {
    return {
      ok: false,
      error: `"${filename}" must be a PDF or PNG (e.g. Bill-1_Costco.pdf, invoice.png).`,
    };
  }

  const detected = detectBillTypeFromFilename(filename);
  if (detected && detected !== expected) {
    const expectedLabel = billTypeLabel(expected);
    const detectedLabel = billTypeLabel(detected);
    return {
      ok: false,
      error: `"${filename}" is marked as a ${detectedLabel} — upload it under ${expectedLabel}s instead.`,
    };
  }

  return { ok: true };
}

export function billTypeMismatchError(
  detected: BillFileType,
  expected: BillFileType
): string {
  return `This file looks like a ${billTypeLabel(detected)}, not a ${billTypeLabel(expected)}. Upload it in the correct tab.`;
}
