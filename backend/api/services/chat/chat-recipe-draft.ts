/** Detect a Creative recipe draft waiting for chef confirmation in chat history. */

import { isAgentAssistantLabel } from "@backend/services/agents/dashboard-chat";
import { KITCHEN_SAVE_CONFIRM_RE, replyIndicatesKitchenActionComplete } from "@backend/services/chat/chat-reply-sanitizer";
import { isDishBrainstormReply } from "@backend/services/chat/dish-brainstorm";

const RECIPE_SECTION_HEADERS =
  /^(?:suggested add-?ons?|prep steps?|ingredients?|visual brief|description|recipe|instructions?)$/i;

/** True when Inventory already finalized a dish build in this thread. */
export function threadHasKitchenBuildInThread(
  messages: Array<{ role: string; content: string }>
): boolean {
  return messages.some(
    (row) =>
      row.role === "assistant" &&
      (/\b(created dish|updated dish)\b.+\b(linked ingredient|recipe steps)\b/i.test(
        row.content
      ) ||
        replyIndicatesKitchenActionComplete(row.content))
  );
}

/** Creative recipe draft text only — excludes finalize summaries with "→" rows. */
export function creativeRecipeDraftText(
  messages: Array<{ role: string; content: string }>
): string {
  for (const row of [...messages].reverse()) {
    if (row.role !== "assistant") continue;
    const text = row.content;
    if (
      /ingredients?\s*:/i.test(text) &&
      /prep steps?/i.test(text) &&
      !/\bingredients ready\b/i.test(text) &&
      !/\bcreated dish\b/i.test(text) &&
      !/→/.test(text) &&
      !isDishBrainstormReply(text)
    ) {
      return text;
    }
  }
  return "";
}

export function threadHasRecipeDraft(
  messages: Array<{ role: string; content: string }>
): boolean {
  if (threadHasKitchenBuildInThread(messages)) return false;

  const assistantText = creativeRecipeDraftText(messages);
  if (!assistantText.trim()) return false;
  if (isDishBrainstormReply(assistantText)) return false;

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

export {
  applyKitchenBuildConfirmCloser,
  CONFIRM_OPTIONS,
  KITCHEN_BUILD_CONFIRM_OPTIONS,
  kitchenBuildConfirmCloser,
  KITCHEN_SAVE_CONFIRM_RE,
  replyAsksKitchenSaveConfirm,
  stripStackedNextStepQuestion,
} from "@backend/services/chat/chat-reply-sanitizer";

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
  if (replyIndicatesKitchenActionComplete(lastAssistant)) return false;

  const asksConfirm =
    KITCHEN_SAVE_CONFIRM_RE.test(lastAssistant) &&
    !/\b(?:link|linking)\b.+\badd[\s-]?on\b/i.test(lastAssistant);

  const hasDishContext =
    (/\bready to save\b.+\bto kitchen\b/i.test(lastAssistant) ||
      /\bready to add\b.+\bto kitchen\b.+\b(recipe|suggested add-?ons)\b/i.test(
        lastAssistant
      )) &&
    (Boolean(inferRecipeDraftDishName(messages)) ||
      /(?:menu name|proposed dish|pos description|visual brief|suggested add-?ons?)/i.test(
        allText
      ) ||
      threadHasRecipeDraft(messages));

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
  if (/^full kitchen build\b/i.test(cleaned)) return false;
  return true;
}

export function cleanMenuDishName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/\*+/g, "")
    .replace(/^\d+\.\s*/, "")
    .replace(/^recipe\s+for\s+/i, "")
    .replace(/^full kitchen build for\s+/i, "")
    .replace(/^full kitchen build\s*[-—:]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const titled = titleCaseDishName(cleaned);
  return isValidRecipeDishName(titled) ? titled : "";
}

export function inferRecipeDraftDishName(
  messages: Array<{ role: string; content: string }>
): string | null {
  for (const row of [...messages].reverse()) {
    const ready = row.content.match(
      /\bready to add\s+\*\*([^*]+)\*\*(?:\s+to\s+kitchen)?/i
    );
    if (ready) {
      const name = cleanMenuDishName(ready[1].trim());
      if (name) return name;
    }
    const readyPlain = row.content.match(
      /\bready to add(?:\s+the)?\s+(.+?)\s+to\s+kitchen\b/i
    );
    if (readyPlain) {
      const name = cleanMenuDishName(readyPlain[1].trim());
      if (name) return name;
    }
    const patterns = [
      /(?:\*\*)?(?:menu name|proposed dish|dish to add)\s*:?\s*\*?\*?\s*([^\n*]+)/i,
      /(?:^|\n)#{1,3}\s*([^\n#*]+)\s*\n/i,
      /\b(?:confirm|kitchen build for)(?:\s+the)?\s+\*\*([^*]+)\*\*/i,
    ];
    for (const pattern of patterns) {
      const match = row.content.match(pattern);
      if (match) {
        const name =
          cleanMenuDishName(match[1].trim().replace(/\*+/g, "")) ||
          titleCaseDishName(match[1].trim().replace(/\*+/g, ""));
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
