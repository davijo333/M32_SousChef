/** Read-only kitchen catalog lookups — client-safe detection only. */

import {
  detectDishPricingQuestion,
  extractDishNameFromPricingQuestion,
} from "@backend/services/chat/chat-dish-pricing";

export type CatalogLookupKind = "dish" | "addon" | "ingredient";

export type CatalogLookupRequest = {
  kind: CatalogLookupKind;
  name: string;
};

const UPDATE_INTENT =
  /\b(?:update|set|adjust)\s+(?:the\s+)?(?:margin|sell\s+price|price|reorder|quantity|qty)\s+to\b/i;

export function detectCatalogLookupQuestion(message: string): boolean {
  const text = message.trim();
  if (!text || UPDATE_INTENT.test(text)) return false;

  if (detectDishPricingQuestion(text)) return true;

  return (
    /\b(?:how much|what(?:'s| is)|tell me)\b.+\b(?:on hand|in stock|inventory|quantity|qty|reorder)\b/i.test(
      text
    ) ||
    /\b(?:on hand|in stock|reorder level|reorder threshold)\b.+\b(?:for|of|on)\b/i.test(text) ||
    /\badd[\s-]?on\b.+\b(?:sell|price|margin)\b/i.test(text) ||
    /\b(?:sell|price|margin)\b.+\badd[\s-]?on\b/i.test(text)
  );
}

export function inferCatalogLookup(
  message: string,
  history: Array<{ role: string; content: string }> = []
): CatalogLookupRequest | null {
  if (UPDATE_INTENT.test(message)) return null;

  const dishName = extractDishNameFromPricingQuestion(message);
  if (dishName && detectDishPricingQuestion(message)) {
    const kind: CatalogLookupKind = /\badd[\s-]?on\b/i.test(message) ? "addon" : "dish";
    return { kind, name: dishName };
  }

  const ingredientPatterns = [
    /\b(?:how much|what(?:'s| is)|tell me)\b[^?.!\n]*(?:on hand|in stock|inventory|quantity|qty)[^?.!\n]*(?:for|of|on)\s+(?:my\s+)?([A-Za-z][A-Za-z0-9\s'-]{2,50})/i,
    /\b(?:on hand|in stock|reorder level|reorder threshold)\b[^?.!\n]*(?:for|of|on)\s+(?:my\s+)?([A-Za-z][A-Za-z0-9\s'-]{2,50})/i,
    /\b(?:my\s+)?([A-Za-z][A-Za-z0-9\s'-]{2,50})\b[^?.!\n]*\b(?:on hand|in stock|reorder level|reorder threshold)\b/i,
  ];
  for (const pattern of ingredientPatterns) {
    const match = message.match(pattern);
    if (!match) continue;
    const name = match[1].trim().replace(/\*+/g, "");
    if (name && name.split(/\s+/).length <= 8) {
      return { kind: "ingredient", name };
    }
  }

  const addonPatterns = [
    /\badd[\s-]?on\b[^?.!\n]*(?:sell|price|margin)[^?.!\n]*(?:for|of|on)\s+(?:my\s+)?([A-Za-z][A-Za-z0-9\s'-]{2,50})/i,
    /\b(?:sell|price|margin)\b[^?.!\n]*\badd[\s-]?on\b[^?.!\n]*([A-Za-z][A-Za-z0-9\s'-]{2,50})/i,
  ];
  for (const pattern of addonPatterns) {
    const match = message.match(pattern);
    if (!match) continue;
    const name = match[1].trim().replace(/\*+/g, "");
    if (name && name.split(/\s+/).length <= 8) {
      return { kind: "addon", name };
    }
  }

  for (const row of [...history].reverse()) {
    if (row.role !== "user") continue;
    const nested = inferCatalogLookup(row.content);
    if (nested) return nested;
  }

  return null;
}
