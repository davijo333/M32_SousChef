import type { SpecialistHandoffTarget } from "@backend/services/agents/chat-handoff";

export type ChatUploadBillType = "supplier" | "customer";

const PURCHASE_PATTERNS = [
  /\bpurchase\s+orders?\b/i,
  /\bwholesaler\b/i,
  /\bsupplier\s+(bill|invoice|order)s?\b/i,
  /\bPOs?\b/i,
  /\brestock\b/i,
];

const SALES_PATTERNS = [
  /\bsales\s+(orders?|receipts?|bills?)\b/i,
  /\bPOS\b/i,
  /\bcustomer\s+(bill|receipt|order)s?\b/i,
  /\bticket\s+sales\b/i,
  /\bSOs?\b/i,
];

const UPLOAD_VERBS = /\b(upload|attach|add|drop|send|process|import)\b/i;

/** Infer supplier vs customer from the chef's message (explicit override only). */
export function detectUploadBillType(message: string): ChatUploadBillType | null {
  const text = message.trim();
  if (!text) return null;

  const purchase = PURCHASE_PATTERNS.some((p) => p.test(text));
  const sales = SALES_PATTERNS.some((p) => p.test(text));
  if (purchase && !sales) return "supplier";
  if (sales && !purchase) return "customer";
  return null;
}

/** Default when classification and message are both ambiguous. */
export function defaultUploadBillType(message: string): ChatUploadBillType {
  return detectUploadBillType(message) ?? "supplier";
}

export function messageMentionsUpload(message: string): boolean {
  return UPLOAD_VERBS.test(message.trim());
}

/** Chef explicitly said all files are PO or SO — overrides auto-identification. */
export function messageOverridesBillType(message: string): ChatUploadBillType | null {
  return detectUploadBillType(message);
}

/** Which specialist should own an attachment batch from Sous Chef chat. */
export function uploadBatchHandoffTarget(
  billType: ChatUploadBillType,
  message: string,
  hasFiles: boolean
): SpecialistHandoffTarget | null {
  if (!hasFiles) return null;
  const explicit = detectUploadBillType(message);
  if (explicit === "supplier") return "inventory";
  if (explicit === "customer") return "business";
  if (messageMentionsUpload(message) || hasFiles) {
    return billType === "customer" ? "business" : "inventory";
  }
  return billType === "customer" ? "business" : "inventory";
}

export function detectUploadConfirm(message: string): boolean {
  return /\b(yes|confirm|go ahead|process(?:\s+it|\s+them|\s+bills?)?|do it|approved?|sure)\b/i.test(
    message.trim()
  );
}
