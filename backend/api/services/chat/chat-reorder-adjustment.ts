import { detectRecipeFinalizeConfirm } from "@backend/services/chat/chat-recipe-build-intent";
import { threadAwaitingKitchenSaveConfirm } from "@backend/services/chat/chat-recipe-draft";

export type ReorderThresholdRequest = {
  ingredientName: string;
  reorderThreshold: number;
};

const REORDER_THRESHOLD_PATTERNS = [
  /\b(?:update|set|adjust|change)\s+(?:the\s+)?reorder(?:\s+level|\s+threshold)?\s+(?:of|for|on)\s+["']?([^"'\n]+?)["']?\s+to\s+([\d.]+)\s*(?:lb|lbs|kg|g|oz|each|unit|units)?\b/i,
  /\breorder(?:\s+level|\s+threshold)?\s+(?:of|for|on)\s+["']([^"']+)["']\s+to\s+([\d.]+)\s*(?:lb|lbs|kg|g|oz|each|unit|units)?\b/i,
];

const REORDER_CONFIRM_PREVIEW =
  /\bUpdate(?: pantry ingredient)? \*\*[^*]+\*\* reorder level to\b/i;

const REORDER_PREVIEW_DETAIL =
  /Update(?: pantry ingredient)? \*\*([^*]+)\*\* reorder level to \*\*([\d.]+)\*\*(?:\s+\w+)?/i;

const REORDER_APPLIED =
  /\bUpdated \*\*[^*]+\*\* reorder (?:level|threshold) to [\d.]+\.?/i;

/** Pantry reorder writes — mirror of price flow's NON_PRICE_KITCHEN_WRITE pairing. */
export const REORDER_ADJUSTMENT_INTENT =
  /\b(?:update|set|adjust|change)\s+(?:the\s+)?reorder(?:\s+level|\s+threshold)?\b/i;

function cleanIngredientName(name: string): string {
  return name.trim().replace(/\*+/g, "").replace(/[.!?]+$/, "");
}

function latestUserMessage(messages: Array<{ role: string; content: string }>): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user" && messages[i].content.trim()) {
      return messages[i].content;
    }
  }
  return "";
}

function parseReorderThresholdFromText(text: string): ReorderThresholdRequest | null {
  for (const pattern of REORDER_THRESHOLD_PATTERNS) {
    const match = text.trim().match(pattern);
    if (!match) continue;
    const ingredientName = cleanIngredientName(match[1]);
    const reorderThreshold = Number(match[2]);
    if (!ingredientName || !Number.isFinite(reorderThreshold) || reorderThreshold < 0) {
      continue;
    }
    return { ingredientName, reorderThreshold };
  }
  return null;
}

function isReorderPreviewMessage(text: string): boolean {
  if (/\bUpdate \*\*[^*]+\*\* sell price to\b/i.test(text)) {
    return false;
  }
  return (
    REORDER_CONFIRM_PREVIEW.test(text) ||
    REORDER_PREVIEW_DETAIL.test(text) ||
    /\bUpdate(?: pantry ingredient)?\s+(?:\*\*[^*]+\*\*|.+)\s+reorder level to\s+[\d.]+\b/i.test(text)
  );
}

function findLastReorderPreviewIndex(
  history: Array<{ role: string; content: string }>
): number {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.role === "assistant" && isReorderPreviewMessage(history[i].content)) {
      return i;
    }
  }
  return -1;
}

function findLastReorderAppliedIndex(
  history: Array<{ role: string; content: string }>
): number {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.role === "assistant" && REORDER_APPLIED.test(history[i].content)) {
      return i;
    }
  }
  return -1;
}

export function detectReorderThresholdIntent(message: string): boolean {
  return REORDER_ADJUSTMENT_INTENT.test(message.trim());
}

export function parseCurrentReorderThresholdRequest(
  userMessage: string
): ReorderThresholdRequest | null {
  return parseReorderThresholdFromText(userMessage.trim());
}

/** Parse the pending reorder change tied to an unanswered preview in thread. */
export function parsePendingReorderForConfirm(
  messages: Array<{ role: string; content: string }>
): ReorderThresholdRequest | null {
  const previewIndex = findLastReorderPreviewIndex(messages);
  if (previewIndex >= 0) {
    const previewText = messages[previewIndex]?.content ?? "";
    const previewMatch = previewText.match(REORDER_PREVIEW_DETAIL);
    if (previewMatch) {
      const reorderThreshold = Number(previewMatch[2]);
      const ingredientName = cleanIngredientName(previewMatch[1]);
      if (ingredientName && Number.isFinite(reorderThreshold)) {
        return { ingredientName, reorderThreshold };
      }
    }

    const plainPreview = previewText.match(
      /Update(?: pantry ingredient)?\s+(.+?)\s+reorder level to\s+([\d.]+)/i
    );
    if (plainPreview) {
      const ingredientName = cleanIngredientName(plainPreview[1]);
      const reorderThreshold = Number(plainPreview[2]);
      if (ingredientName && Number.isFinite(reorderThreshold)) {
        return { ingredientName, reorderThreshold };
      }
    }

    for (let i = previewIndex - 1; i >= 0; i -= 1) {
      const row = messages[i];
      if (row?.role !== "user") continue;
      const parsed = parseReorderThresholdFromText(row.content);
      if (parsed) return parsed;
      if (REORDER_APPLIED.test(row.content)) break;
    }
  }

  for (const row of [...messages].reverse()) {
    if (row.role !== "user") continue;
    const parsed = parseReorderThresholdFromText(row.content);
    if (parsed) return parsed;
  }

  return null;
}

/** Thread is waiting for chef to confirm a reorder-level change preview. */
export function threadAwaitingReorderConfirm(
  history: Array<{ role: string; content: string }>
): boolean {
  const previewIndex = findLastReorderPreviewIndex(history);
  if (previewIndex < 0) return false;

  const appliedIndex = findLastReorderAppliedIndex(history);
  if (appliedIndex > previewIndex) return false;

  for (let i = previewIndex + 1; i < history.length; i += 1) {
    const row = history[i];
    if (row.role !== "user") continue;
    const text = row.content.trim();
    if (!text) continue;
    if (detectRecipeFinalizeConfirm(text)) continue;
    if (parseCurrentReorderThresholdRequest(text)) return false;
  }

  return true;
}

export function detectReorderThresholdConfirm(
  message: string,
  history: Array<{ role: string; content: string }>
): boolean {
  if (!detectRecipeFinalizeConfirm(message)) return false;
  if (threadAwaitingKitchenSaveConfirm(history) && !threadAwaitingReorderConfirm(history)) {
    return false;
  }
  if (REORDER_ADJUSTMENT_INTENT.test(message)) return false;
  return threadAwaitingReorderConfirm(history);
}

export function inferIngredientNameFromReorderThread(
  messages: Array<{ role: string; content: string }>,
  options?: { pendingConfirm?: boolean }
): string | null {
  const adjustment = options?.pendingConfirm
    ? parsePendingReorderForConfirm(messages)
    : parseCurrentReorderThresholdRequest(latestUserMessage(messages)) ??
      parsePendingReorderForConfirm(messages);
  return adjustment?.ingredientName?.trim() || null;
}

export function replyAsksForConfirm(text: string): boolean {
  return (
    isReorderPreviewMessage(text) ||
    /\bsay \*\*confirm\*\* to apply\b/i.test(text) ||
    REORDER_CONFIRM_PREVIEW.test(text)
  );
}
