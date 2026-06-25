import type { DashboardChatContext } from "@backend/services/agents/dashboard-chat";
import { detectBillTypeHeuristic } from "@backend/services/bills/bill-filename";
import { detectRecipeFinalizeConfirm } from "@backend/services/chat/chat-recipe-build-intent";

const BILL_MESSAGE =
  /\b(invoice|purchase order|\bPO\b|sales receipt|\bSO\b|sysco|us foods|costco|process these|upload order|wholesaler)\b/i;

const CATALOG_MESSAGE =
  /\b(add|create|new)\b.+\b(ingredient|dish|pantry|menu item|to pantry|to menu)\b|\b(this (product|item|dish|ingredient|menu))\b|\b(from (this|the) (photo|picture|image|link))\b|\b(product link|image link)\b/i;

const COMPLEX_ADDON_HINTS = [
  "guacamole",
  "salsa",
  "aioli",
  "dressing",
  "reduction",
  "compote",
  "marinade",
  "mousse",
  "coulis",
  "pesto",
  "chutney",
  "relish",
  "vinaigrette",
];

export function shouldParseAttachmentsAsBills(message: string, files: File[]): boolean {
  if (files.some((file) => (detectBillTypeHeuristic(file.name)?.confidence ?? 0) >= 0.94)) {
    return true;
  }
  if (BILL_MESSAGE.test(message)) return true;
  if (CATALOG_MESSAGE.test(message) && !BILL_MESSAGE.test(message)) return false;
  return true;
}

export function shouldIdentifyCatalogAttachments(
  message: string,
  files: File[],
  agentContext: DashboardChatContext
): boolean {
  if (!files.length) return false;
  if (shouldParseAttachmentsAsBills(message, files)) return false;
  if (CATALOG_MESSAGE.test(message)) return true;
  return agentContext === "inventory" || agentContext === "create";
}

export function detectCatalogAddIntent(
  message: string,
  agentContext: DashboardChatContext
): boolean {
  if (CATALOG_MESSAGE.test(message)) return true;
  return (
    (agentContext === "inventory" || agentContext === "create") &&
    /\b(add|create|new)\b/i.test(message)
  );
}

export function extractDirectImageUrls(message: string): string[] {
  const matches = message.match(/https?:\/\/[^\s)>"]+/gi) ?? [];
  return matches.filter((url) => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url));
}

export function catalogItemTypeHint(
  agentContext: DashboardChatContext,
  message: string
): "ingredient" | "dish" | "" {
  if (/\b(dish|menu item|special|sandwich|latte|coffee)\b/i.test(message)) return "dish";
  if (/\b(ingredient|pantry|product|supply)\b/i.test(message)) return "ingredient";
  if (agentContext === "create") return "dish";
  if (agentContext === "inventory") return "ingredient";
  return "";
}

export function isSimpleAddonName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  if (!lower || lower.length > 48) return false;
  if (COMPLEX_ADDON_HINTS.some((hint) => lower.includes(hint))) return false;
  return lower.split(/\s+/).length <= 4;
}

export function extractAddIngredientName(message: string): string | null {
  const text = message.trim();
  if (!text) return null;
  if (/\b(recipe|menu item|dish)\b/i.test(text)) return null;
  if (/\bto\s+(?:the\s+)?(?:dish|recipe)\b/i.test(text)) return null;

  const patterns = [
    /(?:let'?s\s+)?(?:add|create)\s+(?:an?\s+)?ingredient\s+["']([^"']+)["']/i,
    /(?:let'?s\s+)?(?:add|create)\s+(?:an?\s+)?ingredient\s+([A-Za-z][A-Za-z0-9\s'-]{1,40})\s*\.?$/i,
    /add\s+["']([^"']+)["']\s+to\s+(?:the\s+)?pantry/i,
    /add\s+([A-Za-z][A-Za-z0-9\s'-]{1,40})\s+to\s+(?:the\s+)?pantry/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const name = match[1].trim();
    if (name && name.split(/\s+/).length <= 6) return name;
  }
  return null;
}

export function detectAddIngredientIntent(message: string): boolean {
  return Boolean(extractAddIngredientName(message));
}

export function extractAddAddonName(message: string): string | null {
  const text = message.trim();
  if (!text) return null;
  if (/\bsuggest\b.+\badd[\s-]?on/i.test(text)) return null;
  if (/\badd[\s-]?on?s?\s+for\b/i.test(text)) return null;

  const patterns = [
    /(?:add|create)\s+(?:an?\s+)?add[\s-]?on\s+["']([^"']+)["']/i,
    /(?:add|create)\s+["']([^"']+)["']\s+as\s+(?:an?\s+)?add[\s-]?on/i,
    /add\s+["']([^"']+)["']\s+as\s+(?:an?\s+)?add[\s-]?on/i,
    /(?:add|create)\s+(?:an?\s+)?add[\s-]?on\s+([A-Za-z][A-Za-z0-9\s'-]{1,48})/i,
    /add\s+([A-Za-z][A-Za-z0-9\s'-]{1,48})\s+as\s+(?:an?\s+)?add[\s-]?on/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const name = match[1].trim().replace(/\*+/g, "");
    if (name && name.split(/\s+/).length <= 8) return name;
  }
  return null;
}

export function detectAddAddonIntent(message: string): boolean {
  return Boolean(extractAddAddonName(message));
}

/** @deprecated Use extractAddAddonName — all add-ons go to Inventory. */
export function extractAddSimpleAddonName(message: string): string | null {
  const name = extractAddAddonName(message);
  return name && isSimpleAddonName(name) ? name : null;
}

export function detectAddSimpleAddonIntent(message: string): boolean {
  return Boolean(extractAddSimpleAddonName(message));
}

export function extractUpdateIngredientName(message: string): string | null {
  const patterns = [
    /\bupdate\s+(?:the\s+)?ingredient\s+["']([^"']+)["']/i,
    /\bupdate\s+["']([^"']+)["']\s+in\s+(?:the\s+)?pantry/i,
    /\b(?:update|set|adjust)\s+(?:the\s+)?reorder(?:\s+level|\s+threshold)?\s+(?:of|for|on)\s+["']([^"']+)["']/i,
    /\b(?:update|set|adjust)\s+(?:the\s+)?reorder(?:\s+level|\s+threshold)?\s+(?:of|for|on)\s+([A-Za-z][A-Za-z0-9\s'-]{2,50}?)\s+to\b/i,
    /\bchange\s+(?:the\s+)?(?:reorder|qty|quantity)\s+(?:for|on|of)\s+["']?([^"'\n.]+?)["']?\s*$/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

export function detectUpdateIngredientIntent(message: string): boolean {
  return Boolean(extractUpdateIngredientName(message));
}

export function extractUpdateAddonName(message: string): string | null {
  const patterns = [
    /\bupdate\s+(?:the\s+)?add[\s-]?on\s+["']([^"']+)["']/i,
    /\bupdate\s+["']([^"']+)["']\s+add[\s-]?on/i,
    /\bchange\s+(?:the\s+)?(?:sell\s+)?price\s+(?:for|on|of)\s+(?:the\s+)?add[\s-]?on\s+["']?([^"'\n.]+?)["']?\s*$/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

export function detectUpdateAddonIntent(message: string): boolean {
  return Boolean(extractUpdateAddonName(message));
}

/** User confirming a pantry row or simple add-on create (not a dish recipe build). */
export function detectPantryItemSaveConfirm(
  message: string,
  history: Array<{ role: string; content: string }>
): boolean {
  if (!detectRecipeFinalizeConfirm(message)) return false;
  const recent = history
    .slice(-8)
    .map((row) => row.content)
    .join("\n");
  return (
    /\b(add pantry|create_ingredient|pantry item|add[\s-]?on)\b/i.test(recent) &&
    !/\b(prep steps?|visual brief|menu name)\b/i.test(recent)
  );
}
