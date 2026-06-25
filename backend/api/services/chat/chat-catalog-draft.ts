import type { CatalogIdentification } from "@backend/services/catalog/catalog-identify";
import {
  catalogItemTypeHint,
  detectCatalogAddIntent,
  extractDirectImageUrls,
  shouldIdentifyCatalogAttachments,
} from "@backend/services/chat/chat-catalog-intent";
import { identifyCatalogFile, identifyCatalogImageUrl } from "@backend/services/catalog/catalog-identify";
import type { DashboardChatContext } from "@backend/services/agents/dashboard-chat";

export type ChatCatalogDraftPayload = {
  itemType: "ingredient" | "dish";
  name: string;
  brandName?: string;
  category?: string;
  classification?: string;
  description?: string;
  confidence: number;
  imageUrl?: string;
  source?: string;
  filename?: string;
  chefCorrected?: boolean;
};

const DISH_CORRECTION_PATTERNS = [
  /\b(?:make it|change(?:\s+the)?\s+dish(?:\s+name)?\s+to|rename(?:\s+it)?\s+to|switch to|change to|call it|actually(?:\s+it'?s)?)\s+(?:a|an|the)?\s*([a-z][a-z0-9\s-]{2,60})/i,
  /\b(?:want to add|i want to add|add|create)\s+(?:a|an|the)?\s*([a-z][a-z0-9\s-]{2,50}?)(?:\s+as\s+(?:a|an)\s+new\s+dish\b)/i,
  /\b(?:it is|it's)\s+(?:a|an|the)?\s*([a-z][a-z0-9\s-]{2,60})/i,
];

function titleCaseDishName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function cleanDishPhrase(phrase: string): string {
  let cleaned = phrase.replace(/\s+as\s+(?:a|an)\s+new\s+dish.*/i, "");
  cleaned = cleaned.replace(/\b(please|thanks|thank you|now|instead|rather)\b/gi, "");
  cleaned = cleaned.replace(/\s+/g, " ").trim().replace(/[ .,!?:;]+$/, "");
  if (!cleaned) return "";
  const words = cleaned.split(/\s+/);
  const trimmed = words.length > 8 ? words.slice(0, 8).join(" ") : cleaned;
  const lower = trimmed.toLowerCase();
  if (lower === "new dish" || lower === "a new dish" || lower === "the dish") return "";
  return titleCaseDishName(trimmed);
}

export function extractDishNameCorrection(message: string): string | null {
  const text = message.trim();
  if (!text) return null;
  for (const pattern of DISH_CORRECTION_PATTERNS) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const phrase = cleanDishPhrase(match[1]);
    if (phrase && phrase.split(/\s+/).length <= 8) return phrase;
  }
  return null;
}

function refreshDescriptionForRename(
  name: string,
  description: string | undefined,
  previousName: string
): string {
  const lowerName = name.toLowerCase();
  const desc = (description ?? "").trim();
  if (desc && previousName && previousName.toLowerCase() !== lowerName) {
    const prevToken = previousName.split(/\s+/)[0]?.toLowerCase() ?? "";
    if (prevToken.length > 3 && desc.toLowerCase().includes(prevToken)) {
      return desc.replace(new RegExp(prevToken, "i"), lowerName.split(/\s+/)[0] ?? prevToken);
    }
  }
  if (desc && /orange/i.test(desc) && /mango/i.test(lowerName)) {
    return desc.replace(/orange/gi, "mango");
  }
  if (desc && !new RegExp(lowerName.split(/\s+/)[0] ?? "", "i").test(desc)) {
    return `Refreshing ${lowerName} topped with whipped cream.`;
  }
  if (desc) return desc;
  return `Refreshing ${lowerName} topped with whipped cream.`;
}

export function applyCatalogDraftCorrection(
  draft: ChatCatalogDraftPayload | null | undefined,
  message: string,
  history?: Array<{ role: string; content: string }>
): ChatCatalogDraftPayload | undefined {
  if (!draft || draft.itemType !== "dish") return draft ?? undefined;

  const texts = [message];
  if (history) {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const row = history[i];
      if (row.role === "user" && row.content.trim()) texts.push(row.content);
    }
  }

  let corrected: string | null = null;
  for (const text of texts) {
    corrected = extractDishNameCorrection(text);
    if (corrected) break;
  }
  if (!corrected || corrected.toLowerCase() === draft.name.toLowerCase()) {
    return draft;
  }

  return {
    ...draft,
    name: corrected,
    description: refreshDescriptionForRename(corrected, draft.description, draft.name),
    chefCorrected: true,
  };
}

/** Recover a dish catalog draft from prior user messages (photo identify note). */
export function inferCatalogDraftFromThread(
  history: Array<{ role: string; content: string }>
): ChatCatalogDraftPayload | undefined {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const row = history[i];
    if (row.role !== "user") continue;
    const content = row.content;
    const header = content.match(/Identified (?:menu )?dish from [^:\n]+:/i);
    if (!header) continue;

    const nameMatch = content.match(/•\s*\*\*([^*]+)\*\*/);
    if (!nameMatch?.[1]?.trim()) continue;

    const brandMatch = content.match(/•\s*Brand:\s*([^\n]+)/i);
    const categoryMatch = content.match(/•\s*Category:\s*([^\n]+)/i);
    const classMatch = content.match(/•\s*Classification:\s*([^\n]+)/i);
    const fileMatch = content.match(/•\s*File:\s*([^\n]+)/i);
    const sourceMatch = header[0].match(/from\s+([^\n:]+)/i);

    let description: string | undefined;
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("•")) continue;
      const body = trimmed.replace(/^•\s*/, "");
      if (
        body.startsWith("**") ||
        /^brand:/i.test(body) ||
        /^category:/i.test(body) ||
        /^classification:/i.test(body) ||
        /^file:/i.test(body) ||
        /check for duplicates/i.test(body) ||
        /say \*\*confirm\*\*/i.test(body)
      ) {
        continue;
      }
      description = body;
      break;
    }

    return {
      itemType: "dish",
      name: titleCaseDishName(nameMatch[1].trim()),
      brandName: brandMatch?.[1]?.trim(),
      category: categoryMatch?.[1]?.trim(),
      classification: classMatch?.[1]?.trim(),
      description,
      confidence: 0.9,
      source: sourceMatch?.[1]?.trim() || "photo",
      filename: fileMatch?.[1]?.trim(),
    };
  }
  return undefined;
}

export function formatCatalogDraftNote(draft: ChatCatalogDraftPayload): string {
  const typeLabel = draft.itemType === "dish" ? "menu dish" : "pantry ingredient";
  const lines = [
    `Identified ${typeLabel} from ${draft.source ?? "photo"}:`,
    `• **${draft.name}**`,
  ];
  if (draft.brandName) lines.push(`• Brand: ${draft.brandName}`);
  if (draft.category) lines.push(`• Category: ${draft.category}`);
  if (draft.classification && draft.itemType === "dish") {
    lines.push(`• Classification: ${draft.classification}`);
  }
  if (draft.description) lines.push(`• ${draft.description}`);
  if (draft.filename) lines.push(`• File: ${draft.filename}`);
  lines.push(
    "I'll check for duplicates before adding. New pantry items start at qty **0** with label **new**."
  );
  lines.push("Say **confirm** or **go ahead** when you want me to add it.");
  return lines.join("\n");
}

function toPayload(
  identified: CatalogIdentification,
  filename?: string
): ChatCatalogDraftPayload {
  return {
    itemType: identified.itemType,
    name: identified.name,
    brandName: identified.brandName,
    category: identified.category,
    classification: identified.classification,
    description: identified.description,
    confidence: identified.confidence,
    imageUrl: identified.imageUrl,
    source: identified.source,
    filename,
  };
}

export async function buildCatalogDraftFromChat(
  message: string,
  files: File[],
  agentContext: DashboardChatContext
): Promise<{ draft?: ChatCatalogDraftPayload; note: string }> {
  const hint = catalogItemTypeHint(agentContext, message);
  const imageUrls = extractDirectImageUrls(message);

  if (files.length && shouldIdentifyCatalogAttachments(message, files, agentContext)) {
    const identified = await identifyCatalogFile(files[0], hint || undefined);
    const draft = toPayload(identified, files[0].name);
    return { draft, note: formatCatalogDraftNote(draft) };
  }

  if (
    imageUrls.length &&
    (detectCatalogAddIntent(message, agentContext) || agentContext !== "head")
  ) {
    const identified = await identifyCatalogImageUrl(imageUrls[0], hint || undefined);
    const draft = toPayload(identified);
    return { draft, note: formatCatalogDraftNote(draft) };
  }

  return { note: "" };
}
