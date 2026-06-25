import type { DashboardChatContext } from "@backend/services/agents/dashboard-chat";
import { detectBillTypeHeuristic } from "@backend/services/bills/bill-filename";

const BILL_MESSAGE =
  /\b(invoice|purchase order|\bPO\b|sales receipt|\bSO\b|sysco|us foods|costco|process these|upload order|wholesaler)\b/i;

const CATALOG_MESSAGE =
  /\b(add|create|new)\b.+\b(ingredient|dish|pantry|menu item|to pantry|to menu)\b|\b(this (product|item|dish|ingredient|menu))\b|\b(from (this|the) (photo|picture|image|link))\b|\b(product link|image link)\b/i;

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
