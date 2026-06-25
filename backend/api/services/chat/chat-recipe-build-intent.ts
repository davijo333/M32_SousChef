/** Detect full kitchen recipe build vs save-to-suggested only. */

import { threadAwaitingKitchenSaveConfirm } from "@backend/services/chat/chat-recipe-draft";

export function detectRecipeBuildIntent(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  return (
    /\b(add|create|build)\b.+\b(dish|recipe|menu item)\b.+\b(ingredient|pantry|recipe)/i.test(
      text
    ) ||
    /\b(ingredient|pantry).+\b(and|&).+\b(dish|recipe)/i.test(text) ||
    /\blink\b.+\bingredient/i.test(text) ||
    /\badd\b.+\bto\s+(kitchen|pantry|menu)\b/i.test(text)
  );
}

export function detectRecipeFinalizeConfirm(message: string): boolean {
  return /\b(yes|confirm|go ahead|do it|build it|create them|add them|add the|yes add|save(?:\s+it)?|proceed)\b/i.test(
    message
  );
}

export function detectPantryAddZeroConfirm(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (!text) return false;
  const hasAdd = /\b(add|create)\b.+\b(ingredient|ingredients|pantry)\b/i.test(text);
  const hasZero =
    /\b(qty|quantity)\s*0\b/i.test(text) ||
    /\b(zero|0)\b.+\b(qty|quantity)\b/i.test(text);
  return hasAdd && hasZero;
}

/** Confirmed kitchen build from Sous Chef (head) or Creative when a dish draft/plan is active. */
export function detectKitchenBuildConfirm(
  message: string,
  options?: {
    hasCatalogDish?: boolean;
    hasRecipePlan?: boolean;
    hasRecipeDraftInThread?: boolean;
    hasKitchenBuildInThread?: boolean;
    awaitingKitchenSave?: boolean;
    awaitingPriceConfirm?: boolean;
    awaitingReorderConfirm?: boolean;
  }
): boolean {
  if (options?.hasKitchenBuildInThread) {
    return false;
  }
  if (options?.awaitingPriceConfirm) {
    return false;
  }
  if (options?.awaitingReorderConfirm) {
    return false;
  }
  if (detectPantryAddZeroConfirm(message) && options?.hasCatalogDish) {
    return true;
  }
  if (/\b(price|sell price|margin)\b/i.test(message) && !detectRecipeFinalizeConfirm(message)) {
    return false;
  }
  if (!detectRecipeFinalizeConfirm(message)) return false;

  if (
    options?.hasRecipeDraftInThread ||
    options?.awaitingKitchenSave ||
    options?.hasRecipePlan
  ) {
    return true;
  }

  if (
    /\b(save to kitchen|proceed and save|add the dish|add to kitchen)\b/i.test(message)
  ) {
    return true;
  }
  return (
    detectRecipeBuildIntent(message) ||
    (Boolean(options?.hasCatalogDish) &&
      (Boolean(options?.hasRecipeDraftInThread) || Boolean(options?.awaitingKitchenSave))) ||
    (Boolean(options?.hasRecipeDraftInThread) &&
      /\b(dish|recipe|ingredient|kitchen)\b/i.test(message))
  );
}

/** Parse dish name and sell price from a Business Agent recommendation in thread history. */
export function parseRecommendedSellPrice(
  history: Array<{ role: string; content: string }>
): { dishName: string; sellPrice: number } | null {
  for (const row of [...history].reverse()) {
    if (row.role !== "assistant") continue;
    const text = row.content;
    const match = text.match(
      /recommended sell price(?:\s+for(?:\s+the)?\s+\*?\*?([^*\n]+?)\*?\*?)?\s+is\s+\$?([\d.]+)/i
    );
    if (!match) continue;
    const dishName = match[1]?.trim().replace(/\*+/g, "") ?? "";
    const sellPrice = Number(match[2]);
    if (!Number.isFinite(sellPrice) || sellPrice <= 0) continue;
    return { dishName, sellPrice };
  }
  return null;
}

export function shouldUseSuggestionConfirmOnly(message: string): boolean {
  if (detectRecipeBuildIntent(message)) return false;
  return /\b(save (it|that|this)|put it in suggestions?|suggest(?:ed)? only)\b/i.test(message);
}
