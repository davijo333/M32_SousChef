/** Detect a Creative recipe draft waiting for chef confirmation in chat history. */

import { isAgentAssistantLabel } from "@backend/services/agents/dashboard-chat";

const RECIPE_SECTION_HEADERS =
  /^(?:suggested add-?ons?|prep steps?|ingredients?|visual brief|description|recipe|instructions?)$/i;

/** True when Inventory already finalized a dish build in this thread. */
export function threadHasKitchenBuildInThread(
  messages: Array<{ role: string; content: string }>
): boolean {
  return messages.some(
    (row) =>
      row.role === "assistant" &&
      /\b(created dish|updated dish)\b.+\b(linked ingredient|recipe steps)\b/i.test(
        row.content
      )
  );
}

/** Creative recipe draft text only — excludes finalize summaries with "→" rows. */
export function creativeRecipeDraftText(
  messages: Array<{ role: string; content: string }>
): string {
  return messages
    .filter((row) => row.role === "assistant")
    .map((row) => row.content)
    .filter(
      (text) =>
        /ingredients?\s*:/i.test(text) &&
        /prep steps?/i.test(text) &&
        !/\bingredients ready\b/i.test(text) &&
        !/\bcreated dish\b/i.test(text) &&
        !/→/.test(text)
    )
    .join("\n\n");
}

export function threadHasRecipeDraft(
  messages: Array<{ role: string; content: string }>
): boolean {
  if (threadHasKitchenBuildInThread(messages)) return false;

  const assistantText = creativeRecipeDraftText(messages);
  if (!assistantText.trim()) return false;

  const hasIngredients =
    /ingredients?\s*:?\s*\n[\s\S]*?[-•*]\s+/i.test(assistantText) ||
    /[-•*]\s+[A-Za-z][^\n]*\s+[—–-]\s*\d/i.test(assistantText);

  const hasSteps =
    /(?:prep steps?|instructions?|recipe)\s*:?\s*\n\s*1[\).\]:]/i.test(assistantText) ||
    /(?:^|\n)\s*#{1,3}\s*prep steps?/im.test(assistantText) ||
    /\n\s*1[\).\]:]\s+\w/m.test(assistantText);

  const hasDishDraft =
    /(?:menu name|proposed dish|pos description|visual brief)/i.test(assistantText);

  return (hasIngredients && hasSteps) || (hasDishDraft && hasIngredients);
}

/** Last assistant message is asking the chef to confirm a kitchen save. */
export function threadAwaitingKitchenSaveConfirm(
  messages: Array<{ role: string; content: string }>
): boolean {
  if (threadHasKitchenBuildInThread(messages)) return false;
  if (!messages.length) return false;

  const allText = messages.map((row) => row.content).join("\n");
  const lastAssistant = [...messages]
    .reverse()
    .find((row) => row.role === "assistant")?.content;

  if (!lastAssistant?.trim()) return false;

  const asksConfirm =
    /\b(please confirm|would you like to proceed|confirm if you(?:'d| would) like|ready to (?:add|save)|save (?:it|this) to (?:your )?kitchen)\b/i.test(
      lastAssistant
    );

  const hasDishContext =
    Boolean(inferRecipeDraftDishName(messages)) ||
    /(?:menu name|proposed dish|pos description|visual brief|suggested add-?ons?)/i.test(
      allText
    );

  return asksConfirm && hasDishContext;
}

export function shouldOfferKitchenSaveChoices(
  messages: Array<{ role: string; content: string }>,
  options?: { kitchenBuildComplete?: boolean; hasReadyRecipePlan?: boolean }
): boolean {
  if (options?.kitchenBuildComplete || options?.hasReadyRecipePlan) return false;

  const lastAssistant = [...messages]
    .reverse()
    .find((row) => row.role === "assistant")?.content;
  if (
    lastAssistant &&
    /\b(created dish|updated dish|open \*\*kitchen control\*\*|added pantry item)\b/i.test(
      lastAssistant
    )
  ) {
    return false;
  }

  return threadHasRecipeDraft(messages) || threadAwaitingKitchenSaveConfirm(messages);
}

function isValidRecipeDishName(name: string): boolean {
  const cleaned = name.trim();
  if (!cleaned || cleaned.split(/\s+/).length > 8) return false;
  if (isAgentAssistantLabel(cleaned)) return false;
  if (RECIPE_SECTION_HEADERS.test(cleaned)) return false;
  return true;
}

export function inferRecipeDraftDishName(
  messages: Array<{ role: string; content: string }>
): string | null {
  for (const row of [...messages].reverse()) {
    const patterns = [
      /(?:\*\*)?(?:menu name|proposed dish|dish to add)\s*:?\s*\*?\*?\s*([^\n*]+)/i,
      /(?:^|\n)#{1,3}\s*([^\n#*]+)\s*\n/i,
      /\b(?:confirm|kitchen build for)(?:\s+the)?\s+\*?\*?([^*\n.!?]+?)\*?\*?/i,
    ];
    for (const pattern of patterns) {
      const match = row.content.match(pattern);
      if (match) {
        const name = titleCaseDishName(match[1].trim().replace(/\*+/g, ""));
        if (name && isValidRecipeDishName(name)) return name;
      }
    }
  }

  for (const row of messages) {
    if (row.role !== "user") continue;
    const quoted = row.content.match(/\bdish\s+["“']([^"”']+)["”']/i);
    if (quoted) {
      const name = titleCaseDishName(quoted[1].trim());
      if (name && isValidRecipeDishName(name)) return name;
    }
    const match = row.content.match(/\b(?:add|create)\s+(?:a\s+)?dish\s+(.+)/i);
    if (match) {
      const name = titleCaseDishName(
        match[1].replace(/\b(please|thanks)\b.*$/i, "").trim()
      );
      if (name && isValidRecipeDishName(name)) return name;
    }
  }

  return null;
}

function titleCaseDishName(name: string): string {
  const cleaned = name.trim();
  if (!cleaned || cleaned.split(/\s+/).length > 8) return "";
  return cleaned
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
