/** Read-only dish pricing questions — client-safe detection only. */

import { isAgentAssistantLabel } from "@backend/services/agents/dashboard-chat";

const PRICE_KEYWORD_DISH_NAMES = new Set([
  "sell",
  "selling",
  "the",
  "menu",
  "margin",
  "price",
  "selling price",
]);

function cleanDishName(name: string): string {
  return name.trim().replace(/\*+/g, "");
}

export function isLikelyDishName(name: string): boolean {
  const cleaned = cleanDishName(name);
  if (!cleaned || cleaned.split(/\s+/).length > 8) return false;
  if (isAgentAssistantLabel(cleaned)) return false;
  const normalized = cleaned.toLowerCase();
  if (PRICE_KEYWORD_DISH_NAMES.has(normalized)) return false;
  if (/^sell(?:ing)?(\s+price)?$/i.test(normalized)) return false;
  return true;
}

export function detectDishPricingQuestion(message: string): boolean {
  const text = message.trim();
  if (!text) return false;

  if (
    /\b(?:update|set|adjust)\s+(?:the\s+)?(?:margin|sell\s+price|price)\s+to\b/i.test(
      text
    )
  ) {
    return false;
  }

  return (
    /\b(?:what(?:'s| is)|how much|tell me)\b.+\b(?:sell(?:ing)?\s+price|price|margin)\b/i.test(
      text
    ) ||
    /\b(?:sell(?:ing)?\s+price|margin)\b.+\b(?:for|on|of)\b/i.test(text) ||
    /\b(?:price|margin)\s+(?:for|on|of)\s+/i.test(text)
  );
}

export function extractDishNameFromPricingQuestion(message: string): string | null {
  const patterns = [
    /\b(?:what(?:'s| is)|how much|tell me)\b[^?.!\n]*(?:sell(?:ing)?\s+price|price|margin)[^?.!\n]*(?:for|on|of)\s+(?:my\s+)?([A-Za-z][A-Za-z0-9\s'-]{2,50})/i,
    /\b(?:sell(?:ing)?\s+price|margin|price)\b[^?.!\n]*(?:for|on|of)\s+(?:my\s+)?([A-Za-z][A-Za-z0-9\s'-]{2,50})/i,
    /\b(?:my\s+)?([A-Za-z][A-Za-z0-9\s'-]{2,50})\b[^?.!\n]*\b(?:sell(?:ing)?\s+price|margin)\b/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (!match) continue;
    const name = match[1].trim().replace(/\*+/g, "");
    if (name && name.split(/\s+/).length <= 8) return name;
  }
  return null;
}

const RECIPE_SECTION_HEADERS =
  /^(?:suggested add-?ons?|prep steps?|ingredients?|visual brief|description|recipe|instructions?)$/i;

/** Dish name from a catalog/pricing assistant reply (e.g. **Watermelon Cooler**). */
export function extractDishNameFromCatalogReply(content: string): string | null {
  const confirmMatch = content.match(
    /\b(?:confirm|kitchen build for)(?:\s+the)?\s+\*?\*?([^*\n.!?]+?)\*?\*?\s*[.!?]?\s*$/im
  );
  if (confirmMatch) {
    const fromConfirm = cleanDishName(confirmMatch[1]);
    if (isLikelyDishName(fromConfirm)) return fromConfirm;
  }

  for (const match of content.matchAll(/^#{1,3}\s*([^\n#*]+)\s*$/gim)) {
    const header = cleanDishName(match[1]);
    if (!header || RECIPE_SECTION_HEADERS.test(header)) continue;
    if (isLikelyDishName(header)) return header;
  }

  for (const match of content.matchAll(/^\*\*([^*\n]+)\*\*/gm)) {
    const name = cleanDishName(match[1]);
    if (isLikelyDishName(name)) return name;
  }

  return null;
}

/**
 * Recover the dish the chef is discussing from thread history — pricing questions,
 * catalog replies, and explicit price-update phrasing. Used to lock context across turns.
 */
export function inferDishSubjectFromThread(
  messages: Array<{ role: string; content: string }>
): string | null {
  for (const row of [...messages].reverse()) {
    if (row.role === "user") {
      const fromPricing = extractDishNameFromPricingQuestion(row.content);
      if (fromPricing && isLikelyDishName(fromPricing)) return fromPricing;

      const sellingOf = row.content.match(
        /\b(?:update|set|adjust)\s+(?:the\s+)?sell(?:ing)?\s+price\s+(?:of|for)\s+(.+?)\s+to\s+\$?[\d.]+/i
      );
      if (sellingOf) {
        const name = cleanDishName(sellingOf[1]);
        if (isLikelyDishName(name)) return name;
      }
    }

    if (row.role === "assistant") {
      const fromCatalog = extractDishNameFromCatalogReply(row.content);
      if (fromCatalog) return fromCatalog;
    }
  }
  return null;
}
