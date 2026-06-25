import { inferRecipeDraftDishName, threadAwaitingKitchenSaveConfirm } from "@backend/services/chat/chat-recipe-draft";
import { detectRecipeFinalizeConfirm } from "@backend/services/chat/chat-recipe-build-intent";
import {
  inferDishSubjectFromThread,
  isLikelyDishName,
} from "@backend/services/chat/chat-dish-pricing";

export type PriceAdjustmentRequest =
  | { mode: "margin"; targetMargin: number; dishName?: string }
  | { mode: "sell"; sellPrice: number; dishName?: string };

export type ResolvedSellPrice = {
  slug: string;
  name: string;
  sellPrice: number;
  foodCost: number;
};

const SELLING_PRICE_OF_DISH_TO =
  /\b(?:update|set|adjust)\s+(?:the\s+)?sell(?:ing)?\s+price\s+(?:of|for)\s+(.+?)\s+to\s+\$?([\d.]+)/i;

const SELLING_PRICE_TO =
  /\b(?:update|set|adjust)\s+(?:the\s+)?sell(?:ing)?\s+price\s+to\s+\$?([\d.]+)/i;

const DISH_SELL_PRICE_TO =
  /\b(?:update|set|adjust)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9\s'-]{2,50}?)\s+(?:sell\s+)?price\s+to\s+\$?([\d.]+)/i;

const SIMPLE_SELL_PRICE_TO =
  /\b(?:update|set|adjust)\s+(?:the\s+)?(?:sell\s+)?price\s+to\s+\$?([\d.]+)/i;

const DISH_MARGIN_TO =
  /\b(?:update|set|adjust)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9\s'-]{2,50}?)\s+margin\s+to\s+\$?([\d.]+)/i;

const SIMPLE_MARGIN_TO = /\b(?:update|set|adjust)\s+(?:the\s+)?margin\s+to\s+\$?([\d.]+)/i;

const PRICE_CONFIRM_PREVIEW =
  /\b(?:recommended sell price|set this price|apply the change|sell price would be|margin adjustment|Update \*\*[^*]+\*\* sell price to)\b/i;

const PRICE_CONFIRM_ASK =
  /\b(?:proceed with the price change|confirm if you(?:'d| would) like to proceed|maintain the current price)\b/i;

const PRICE_APPLIED = /\bUpdated \*\*[^*]+\*\* sell price to \$?[\d.]+\.?/i;

const PRICE_PREVIEW_DETAIL =
  /Update \*\*([^*]+)\*\* sell price to \*\*\$?([\d.]+)\*\*/i;

/** Pantry writes that should supersede a stale price-confirm gate. */
export const NON_PRICE_KITCHEN_WRITE =
  /\b(?:update|set|adjust|change)\s+(?:the\s+)?(?:reorder(?:\s+level|\s+threshold)?|quantity|qty|on[- ]?hand)\b/i;

function cleanDishName(name: string): string {
  return name.trim().replace(/\*+/g, "");
}

function latestUserMessage(messages: Array<{ role: string; content: string }>): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user" && messages[i].content.trim()) {
      return messages[i].content;
    }
  }
  return "";
}

function parsePriceAdjustmentFromText(text: string): PriceAdjustmentRequest | null {
  const sellingOf = text.match(SELLING_PRICE_OF_DISH_TO);
  if (sellingOf) {
    const sellPrice = Number(sellingOf[2]);
    const dishName = cleanDishName(sellingOf[1]);
    if (Number.isFinite(sellPrice) && sellPrice > 0 && isLikelyDishName(dishName)) {
      return { mode: "sell", sellPrice, dishName };
    }
  }

  const sellingTo = text.match(SELLING_PRICE_TO);
  if (sellingTo) {
    const sellPrice = Number(sellingTo[1]);
    if (Number.isFinite(sellPrice) && sellPrice > 0) {
      return { mode: "sell", sellPrice };
    }
  }

  const dishMargin = text.match(DISH_MARGIN_TO);
  if (dishMargin) {
    const targetMargin = Number(dishMargin[2]);
    const dishName = cleanDishName(dishMargin[1]);
    if (Number.isFinite(targetMargin) && targetMargin > 0 && isLikelyDishName(dishName)) {
      return { mode: "margin", targetMargin, dishName };
    }
  }

  const marginMatch = text.match(SIMPLE_MARGIN_TO);
  if (marginMatch) {
    const targetMargin = Number(marginMatch[1]);
    if (Number.isFinite(targetMargin) && targetMargin > 0) {
      return { mode: "margin", targetMargin };
    }
  }

  const dishSell = text.match(DISH_SELL_PRICE_TO);
  if (dishSell) {
    const sellPrice = Number(dishSell[2]);
    const dishName = cleanDishName(dishSell[1]);
    if (Number.isFinite(sellPrice) && sellPrice > 0 && isLikelyDishName(dishName)) {
      return { mode: "sell", sellPrice, dishName };
    }
  }

  const sellMatch = text.match(SIMPLE_SELL_PRICE_TO);
  if (sellMatch) {
    const sellPrice = Number(sellMatch[1]);
    if (Number.isFinite(sellPrice) && sellPrice > 0) {
      return { mode: "sell", sellPrice };
    }
  }

  return null;
}

function isPricePreviewMessage(text: string): boolean {
  if (/\bUpdate(?: pantry ingredient)?\s+(?:\*\*[^*]+\*\*|.+)\s+reorder level to\b/i.test(text)) {
    return false;
  }
  return PRICE_CONFIRM_PREVIEW.test(text) || PRICE_PREVIEW_DETAIL.test(text) || PRICE_CONFIRM_ASK.test(text);
}

function findLastPricePreviewIndex(history: Array<{ role: string; content: string }>): number {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.role === "assistant" && isPricePreviewMessage(history[i].content)) {
      return i;
    }
  }
  return -1;
}

function findLastPriceAppliedIndex(history: Array<{ role: string; content: string }>): number {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.role === "assistant" && PRICE_APPLIED.test(history[i].content)) {
      return i;
    }
  }
  return -1;
}

/** Parse a sell-price or margin change from the chef's latest message only. */
export function parseCurrentPriceAdjustmentRequest(
  userMessage: string
): PriceAdjustmentRequest | null {
  return parsePriceAdjustmentFromText(userMessage.trim());
}

/** Parse the pending price change tied to an unanswered preview in thread. */
export function parsePendingPriceAdjustmentForConfirm(
  messages: Array<{ role: string; content: string }>
): PriceAdjustmentRequest | null {
  const previewIndex = findLastPricePreviewIndex(messages);
  if (previewIndex < 0) return null;

  const previewText = messages[previewIndex]?.content ?? "";
  const previewMatch = previewText.match(PRICE_PREVIEW_DETAIL);
  if (previewMatch) {
    const sellPrice = Number(previewMatch[2]);
    const dishName = cleanDishName(previewMatch[1]);
    if (Number.isFinite(sellPrice) && sellPrice > 0 && isLikelyDishName(dishName)) {
      return { mode: "sell", sellPrice, dishName };
    }
  }

  for (let i = previewIndex - 1; i >= 0; i -= 1) {
    const row = messages[i];
    if (row?.role !== "user") continue;
    const parsed = parsePriceAdjustmentFromText(row.content);
    if (parsed) return parsed;
    if (PRICE_APPLIED.test(row.content)) break;
  }

  return null;
}

/** @deprecated Prefer parseCurrentPriceAdjustmentRequest or parsePendingPriceAdjustmentForConfirm. */
export function parsePriceAdjustmentRequest(
  messages: Array<{ role: string; content: string }>
): PriceAdjustmentRequest | null {
  const current = parseCurrentPriceAdjustmentRequest(latestUserMessage(messages));
  if (current) return current;
  return parsePendingPriceAdjustmentForConfirm(messages);
}

/** Thread is waiting for chef to confirm a sell-price or margin change preview. */
export function threadAwaitingPriceConfirm(
  history: Array<{ role: string; content: string }>
): boolean {
  const previewIndex = findLastPricePreviewIndex(history);
  if (previewIndex < 0) return false;

  const appliedIndex = findLastPriceAppliedIndex(history);
  if (appliedIndex > previewIndex) return false;

  for (let i = previewIndex + 1; i < history.length; i += 1) {
    const row = history[i];
    if (row.role !== "user") continue;
    const text = row.content.trim();
    if (!text) continue;
    if (detectRecipeFinalizeConfirm(text) && !NON_PRICE_KITCHEN_WRITE.test(text)) continue;
    if (NON_PRICE_KITCHEN_WRITE.test(text)) return false;
    if (parseCurrentPriceAdjustmentRequest(text)) return false;
  }

  return true;
}

/** Chef confirming a margin or sell-price change previewed in thread. */
export function detectPriceAdjustmentConfirm(
  message: string,
  history: Array<{ role: string; content: string }>
): boolean {
  if (!detectRecipeFinalizeConfirm(message)) return false;
  if (threadAwaitingKitchenSaveConfirm(history)) return false;
  if (NON_PRICE_KITCHEN_WRITE.test(message)) return false;
  return threadAwaitingPriceConfirm(history);
}

/** Chef confirming a Business Agent sell-price recommendation. */
export function detectSellPriceConfirm(
  message: string,
  history: Array<{ role: string; content: string }>
): boolean {
  return detectPriceAdjustmentConfirm(message, history);
}

export function inferDishNameFromPriceThread(
  messages: Array<{ role: string; content: string }>,
  options?: { pendingConfirm?: boolean }
): string | null {
  const adjustment = options?.pendingConfirm
    ? parsePendingPriceAdjustmentForConfirm(messages)
    : parseCurrentPriceAdjustmentRequest(latestUserMessage(messages)) ??
      parsePendingPriceAdjustmentForConfirm(messages);

  if (adjustment?.dishName && isLikelyDishName(adjustment.dishName)) {
    return adjustment.dishName;
  }

  const fromThread = inferDishSubjectFromThread(messages);
  if (fromThread) return fromThread;

  const fromDraft = inferRecipeDraftDishName(messages);
  if (fromDraft) return fromDraft;

  return null;
}
