import type { CatalogIdentification } from "@/lib/catalog-identify";
import {
  catalogItemTypeHint,
  detectCatalogAddIntent,
  extractDirectImageUrls,
  shouldIdentifyCatalogAttachments,
} from "@/lib/chat-catalog-intent";
import { identifyCatalogFile, identifyCatalogImageUrl } from "@/lib/catalog-identify";
import type { DashboardChatContext } from "@/lib/dashboard-chat";

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
};

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
