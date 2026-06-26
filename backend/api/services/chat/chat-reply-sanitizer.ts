/**
 * Head chat reply rules — one question per message, uniform confirm gates.
 */

import { replyAsksForConfirm as replyAsksReorderConfirm } from "@backend/services/chat/chat-reorder-adjustment";
import { threadAwaitingReorderConfirm } from "@backend/services/chat/chat-reorder-adjustment";
import { threadAwaitingPriceConfirm } from "@backend/services/chat/chat-price-adjustment";
import { isDishBrainstormReply } from "@backend/services/chat/dish-brainstorm";
import { cleanMenuDishName, inferRecipeDraftDishName, threadAwaitingKitchenSaveConfirm } from "@backend/services/chat/chat-recipe-draft";
import type { WorkflowStatePayload } from "@backend/services/chat/workflow-state";
import { isLinkChatConfirmStep, isLinkChatWorkflow } from "@backend/services/chat/workflow-state";
import { isWorkflowConfirmGate } from "@backend/services/chat/workflow-state";

export const CONFIRM_OPTIONS = "(Yes/No/Update Instructions)";
export const DISH_PICK_OPTIONS = "(Yes/No/Customize)";

export function hasConfirmOptions(text: string): boolean {
  const body = text ?? "";
  return body.includes(CONFIRM_OPTIONS) || body.includes(DISH_PICK_OPTIONS);
}

/** @deprecated Use CONFIRM_OPTIONS */
export const KITCHEN_BUILD_CONFIRM_OPTIONS = CONFIRM_OPTIONS;

export const KITCHEN_SAVE_CONFIRM_RE =
  /\b(?:ready to add|please confirm(?:\s+the)?(?:\s+kitchen build)?|confirm the kitchen build|want(?:\s+me)?\s+to\s+build|would you like to proceed|confirm if you(?:'d| would) like|ready to (?:add|save)|save (?:it|this) to (?:your )?kitchen)\b/i;

const GENERIC_CLOSER_RE =
  /\n\n(?:What would you like to do next\??|What should we do next\??|Would you like me to (?:convert|run)|Should I prepare)[^\n]*\??\s*$/i;

const TRAILING_CONFIRM_LINE_RE =
  /\n\n(?:Ready to add[^\n]*|Please confirm[^\n]*|Would you like[^\n]*|Let me know which[^\n]*|Say \*\*confirm\*\*[^\n]*)(?:\n[^\n]+)?\s*$/i;

const PRICE_CONFIRM_RE =
  /\b(?:Update \*\*[^*]+\*\* sell price to|proceed with the price change|confirm if you(?:'d| would) like to proceed|say \*\*confirm\*\* to apply)\b/i;

const CATALOG_CONFIRM_RE =
  /\b(?:say \*\*confirm\*\*|go ahead or \*\*confirm\*\*|when you want me to add)\b/i;

const BILL_CONFIRM_RE = /\b(?:go ahead or \*\*confirm\*\*|confirm to process)\b/i;

const GENERIC_CONFIRM_RE =
  /\b(?:please confirm|would you like to proceed|ready to (?:add|save)|save (?:it|this) to (?:your )?kitchen)\b/i;

const DISH_PICK_ASK_RE =
  /\b(?:let me know which dish|which dish you(?:'d| would) like|confirm a dish or customize|modifications in mind)\b/i;

/** Success lines after inventory/menu writes — must not get another confirm gate. */
export const KITCHEN_ACTION_COMPLETE_RE =
  /\b(?:(?:has )?been saved to (?:your )?kitchen|saved to (?:your )?kitchen|created (?:dish|add[\s-]?on)|updated (?:dish|add[\s-]?on)|linked (?:ingredient|add[\s-]?on)|(?:ingredient|add[\s-]?on).+\blinked\b|added pantry item|already linked|no change needed|updated add-on|created add-on|reorder level updated|sell price updated|confirmed — updating add-?on|linked dishes →)\b/i;

export function replyIndicatesKitchenActionComplete(text: string): boolean {
  return KITCHEN_ACTION_COMPLETE_RE.test((text ?? "").trim());
}

export type ConfirmGateKind =
  | "kitchen_build"
  | "kitchen_finalize"
  | "link_confirm"
  | "dish_pick"
  | "catalog_create"
  | "price_change"
  | "reorder_change"
  | "bill_upload"
  | "suggested_save"
  | "generic";

export function stripGenericClosers(reply: string): string {
  let text = (reply ?? "").trim();
  for (let i = 0; i < 4; i += 1) {
    const next = text.replace(GENERIC_CLOSER_RE, "").trim();
    if (next === text) break;
    text = next;
  }
  return text;
}

/** @deprecated Use stripGenericClosers */
export function stripStackedNextStepQuestion(reply: string): string {
  return stripGenericClosers(reply);
}

export function replyAsksKitchenSaveConfirm(text: string): boolean {
  return KITCHEN_SAVE_CONFIRM_RE.test(text);
}

export function replyAsksAnyConfirmGate(text: string): boolean {
  const body = (text ?? "").trim();
  if (!body) return false;
  return (
    replyAsksKitchenSaveConfirm(body) ||
    isDishBrainstormReply(body) ||
    DISH_PICK_ASK_RE.test(body) ||
    PRICE_CONFIRM_RE.test(body) ||
    replyAsksReorderConfirm(body) ||
    CATALOG_CONFIRM_RE.test(body) ||
    BILL_CONFIRM_RE.test(body) ||
    GENERIC_CONFIRM_RE.test(body) ||
    hasConfirmOptions(body)
  );
}

export function paragraphAsksChef(text: string): boolean {
  const p = (text ?? "").trim();
  if (!p) return false;
  return (
    /\?/.test(p) ||
    replyAsksAnyConfirmGate(p) ||
    isDishBrainstormReply(p) ||
    DISH_PICK_ASK_RE.test(p) ||
    /\b(?:Would you like|Let me know which|Should I|Say \*\*)/i.test(p)
  );
}

/** Keep one blocking ask — prefer the last confirm-gate paragraph. */
export function collapseMultipleQuestionBlocks(reply: string): string {
  let text = stripGenericClosers(reply);
  const blocks = text.split(/\n\n+/);
  const askIndices = blocks
    .map((block, index) => (paragraphAsksChef(block) ? index : -1))
    .filter((index) => index >= 0);

  if (askIndices.length <= 1) return text;

  const keep = askIndices[askIndices.length - 1];
  return blocks
    .filter((block, index) => index === keep || !paragraphAsksChef(block))
    .join("\n\n")
    .trim();
}

export function confirmGateCloser(kind: ConfirmGateKind, subject: string): string {
  const label = subject.trim();
  switch (kind) {
    case "kitchen_build":
      return `Ready to add **${label || "this dish"}** to Kitchen with the recipe and suggested add-ons? ${CONFIRM_OPTIONS}`;
    case "kitchen_finalize":
      return `Ready to save **${label || "this dish"}** to Kitchen now? ${CONFIRM_OPTIONS}`;
    case "link_confirm":
      return `Ready to link **${label || "this"}**? ${CONFIRM_OPTIONS}`;
    case "dish_pick":
      return `Which dish — **1**, **2**, or **3**? (Yes = option 1, or reply with the name.) ${DISH_PICK_OPTIONS}`;
    case "catalog_create":
      return `Please confirm adding **${label || "this item"}** to the catalog. ${CONFIRM_OPTIONS}`;
    case "price_change":
      return `Please confirm this price change${label ? ` for **${label}**` : ""}. ${CONFIRM_OPTIONS}`;
    case "reorder_change":
      return `Please confirm this reorder level change${label ? ` for **${label}**` : ""}. ${CONFIRM_OPTIONS}`;
    case "bill_upload":
      return `Please confirm processing these bills. ${CONFIRM_OPTIONS}`;
    case "suggested_save":
      return `Please confirm saving **${label || "this suggestion"}** to Suggested. ${CONFIRM_OPTIONS}`;
    default:
      return `Please confirm before I proceed. ${CONFIRM_OPTIONS}`;
  }
}

export function inferConfirmGateKind(
  reply: string,
  workflowState: WorkflowStatePayload | null,
  history?: Array<{ role: string; content: string }>
): ConfirmGateKind | null {
  if (isLinkChatWorkflow(workflowState)) {
    if (isLinkChatConfirmStep(workflowState)) {
      const text = (reply ?? "").trim();
      if (text && hasConfirmOptions(text)) return null;
      return "link_confirm";
    }
    return null;
  }
  if (workflowState?.workflowId === "add_dish_from_chat") {
    if (workflowState.stepId === "pick_dish") return "dish_pick";
    if (workflowState.stepId === "confirm_dish_identity") return "catalog_create";
    if (workflowState.stepId === "confirm_finalize") return "kitchen_finalize";
    if (workflowState.stepId === "confirm_recipe") return null;
    if (
      workflowState.stepId === "draft_recipe" ||
      workflowState.stepId === "duplicate_check" ||
      workflowState.stepId === "gather_preferences" ||
      workflowState.stepId === "suggest_dish_ideas" ||
      workflowState.stepId === "confirm_new_ingredients" ||
      workflowState.stepId === "check_recipe_ingredients" ||
      workflowState.stepId === "persist_build"
    ) {
      return null;
    }
  }
  if (
    workflowState &&
    (workflowState.workflowId === "add_ingredient_from_chat" ||
      workflowState.workflowId === "add_addon_from_chat") &&
    workflowState.stepId === "confirm_create"
  ) {
    return "catalog_create";
  }

  const text = (reply ?? "").trim();
  if (!text) return null;
  if (replyIndicatesKitchenActionComplete(text)) return null;
  if (/\b(?:link|linking|attach)\b.+\badd[\s-]?on\b/i.test(text)) {
    if (hasConfirmOptions(text)) return null;
    return isLinkChatConfirmStep(workflowState) ? "link_confirm" : null;
  }

  if (isDishBrainstormReply(text) || DISH_PICK_ASK_RE.test(text)) return "dish_pick";
  if (
    workflowState?.workflowId === "add_dish_from_chat" &&
    (workflowState.stepId === "confirm_dish_identity" ||
      workflowState.stepId === "pick_dish" ||
      workflowState.stepId === "duplicate_check" ||
      workflowState.stepId === "confirm_recipe" ||
      workflowState.stepId === "confirm_new_ingredients" ||
      workflowState.stepId === "confirm_finalize" ||
      workflowState.stepId === "check_recipe_ingredients" ||
      workflowState.stepId === "persist_build")
  ) {
    return null;
  }
  if (replyAsksKitchenSaveConfirm(text)) {
    if (/\bwith the recipe and suggested add-?ons\b/i.test(text)) return "kitchen_build";
    if (/\bready to save\b/i.test(text)) return "kitchen_finalize";
    return "kitchen_build";
  }
  if (PRICE_CONFIRM_RE.test(text)) return "price_change";
  if (replyAsksReorderConfirm(text)) return "reorder_change";
  if (BILL_CONFIRM_RE.test(text)) return "bill_upload";
  if (/\bsave (?:it|this) to suggested\b/i.test(text)) return "suggested_save";
  if (CATALOG_CONFIRM_RE.test(text) || /\bcheck for duplicates before adding\b/i.test(text)) {
    return "catalog_create";
  }
  if (GENERIC_CONFIRM_RE.test(text)) return "generic";

  if (history?.length && !replyIndicatesKitchenActionComplete(text)) {
    const lastAssistant = [...history].reverse().find((row) => row.role === "assistant")?.content;
    if (
      lastAssistant &&
      !replyIndicatesKitchenActionComplete(lastAssistant) &&
      replyAsksAnyConfirmGate(lastAssistant)
    ) {
      if (replyAsksKitchenSaveConfirm(lastAssistant)) {
        if (/\b(?:link|linking)\b.+\badd[\s-]?on\b/i.test(lastAssistant)) return "link_confirm";
        if (/\bwith the recipe and suggested add-?ons\b/i.test(lastAssistant)) return "kitchen_build";
        if (/\bready to save\b/i.test(lastAssistant)) return "kitchen_finalize";
        return "kitchen_build";
      }
      if (PRICE_CONFIRM_RE.test(lastAssistant)) return "price_change";
      if (replyAsksReorderConfirm(lastAssistant)) return "reorder_change";
    }
  }

  return null;
}

function inferLinkSubjectFromReply(reply: string): string {
  const match = reply.match(
    /\b(?:link|linking|attach)\s+(?:add[\s-]?on\s+)?\*\*([^*]+)\*\*\s+to\s+\*\*([^*]+)\*\*/i
  );
  if (match) {
    return `${match[1].trim()} to ${match[2].trim()}`;
  }
  const plain = reply.match(
    /\b(?:link|linking|attach)\s+(?:add[\s-]?on\s+)?(.+?)\s+to\s+(?:the\s+)?(.+?)(?:[.?!]|$)/i
  );
  if (plain) {
    const left = plain[1].trim().replace(/\*+/g, "");
    const right = plain[2].trim().replace(/\*+/g, "");
    if (left && right && !/^(it|that|this)$/i.test(left)) {
      return `${left} to ${right}`;
    }
  }
  return "";
}

function inferLinkSubjectFromHistory(
  history: Array<{ role: string; content: string }>
): string {
  for (const row of [...history].reverse()) {
    if (row.role !== "assistant" && row.role !== "user") continue;
    const subject = inferLinkSubjectFromReply(row.content);
    if (subject) return subject;
    const addonMatch = row.content.match(/\*\*([^*]+)\*\*\s*\(`addon-[^`]+`\)/i);
    const dishMatch = row.content.match(/\blink it to\s+(.+?)(?:[.?!]|$)/i);
    if (addonMatch && dishMatch) {
      return `${addonMatch[1].trim()} to ${dishMatch[1].trim()}`;
    }
  }
  return "";
}

function inferConfirmSubject(
  kind: ConfirmGateKind,
  reply: string,
  workflowState: WorkflowStatePayload | null,
  history: Array<{ role: string; content: string }>
): string {
  if (kind === "link_confirm") {
    const baggage = workflowState?.baggage ?? {};
    if (workflowState?.workflowId === "link_addon_ingredients_chat") {
      const ingredient = String(
        baggage.link_ingredient_name ?? baggage.linkIngredientName ?? ""
      ).trim();
      const addon = String(
        baggage.locked_name ??
          baggage.lockedName ??
          workflowState?.lockedName ??
          ""
      ).trim();
      if (ingredient && addon) {
        return `${ingredient} to ${addon} add-on`;
      }
    }
    const addon = String(baggage.addon_name ?? baggage.addonName ?? "").trim();
    const dish = String(
      baggage.locked_name ??
        baggage.lockedName ??
        workflowState?.lockedName ??
        ""
    ).trim();
    if (addon && dish) {
      return `${addon} to ${cleanMenuDishName(dish) || dish}`;
    }
    return inferLinkSubjectFromReply(reply) || inferLinkSubjectFromHistory(history) || "";
  }

  if (workflowState?.lockedName?.trim()) {
    return cleanMenuDishName(workflowState.lockedName.trim()) || workflowState.lockedName.trim();
  }

  if (kind === "kitchen_build" || kind === "suggested_save") {
    return inferRecipeDraftDishName([...history, { role: "assistant", content: reply }]) ?? "";
  }

  if (kind === "price_change") {
    const match = reply.match(/Update \*\*([^*]+)\*\* sell price to/i);
    if (match?.[1]) return match[1].trim();
  }

  if (kind === "reorder_change") {
    const match = reply.match(/Update(?: pantry ingredient)? \*\*([^*]+)\*\* reorder level to/i);
    if (match?.[1]) return match[1].trim();
  }

  const catalogMatch = reply.match(/Identified (?:menu )?(?:dish|pantry ingredient)[^:]*:\s*\n• \*\*([^*]+)\*\*/i);
  if (catalogMatch?.[1]) return catalogMatch[1].trim();

  return "";
}

export function applyConfirmGateCloser(
  reply: string,
  kind: ConfirmGateKind,
  subject: string
): string {
  let text = stripGenericClosers(reply);
  text = text
    .replace(
      /\n\n(?:Ready to add[^\n]*|Please confirm[^\n]*|Would you like[^\n]*|Let me know which[^\n]*)[^\n]*(?:\n[^\n]+)?\s*$/i,
      ""
    )
    .trim();
  if (hasConfirmOptions(text)) return text;
  return `${text}\n\n${confirmGateCloser(kind, subject)}`;
}

/** @deprecated Use applyConfirmGateCloser */
export function applyKitchenBuildConfirmCloser(reply: string, dishName: string): string {
  return applyConfirmGateCloser(reply, "kitchen_build", dishName);
}

export function kitchenBuildConfirmCloser(dishName: string): string {
  return confirmGateCloser("kitchen_build", dishName);
}

export type SanitizeHeadReplyOptions = {
  workflowState: WorkflowStatePayload | null;
  history: Array<{ role: string; content: string }>;
  kitchenBuildComplete?: boolean;
  finalizeAttempted?: boolean;
  appendNextStep?: boolean;
};

export function sanitizeHeadChatReply(
  reply: string,
  options: SanitizeHeadReplyOptions
): string {
  let text = stripGenericClosers((reply ?? "").trim());
  if (!text) return text;

  if (replyIndicatesKitchenActionComplete(text)) {
    return collapseMultipleQuestionBlocks(text);
  }

  const kind =
    options.kitchenBuildComplete || options.finalizeAttempted
      ? null
      : inferConfirmGateKind(text, options.workflowState, options.history);
  if (kind) {
    const subject = inferConfirmSubject(kind, text, options.workflowState, options.history);
    text = applyConfirmGateCloser(text, kind, subject);
  }

  text = collapseMultipleQuestionBlocks(text);

  const mayAppend =
    options.appendNextStep !== false &&
    !options.kitchenBuildComplete &&
    !options.finalizeAttempted &&
    !kind &&
    !inferConfirmGateKind(text, options.workflowState) &&
    !replyAsksAnyConfirmGate(text) &&
    !isWorkflowConfirmGate(options.workflowState) &&
    !threadAwaitingKitchenSaveConfirm(options.history) &&
    !threadAwaitingPriceConfirm(options.history) &&
    !threadAwaitingReorderConfirm(options.history) &&
    (text.match(/\?/g) ?? []).length === 0;

  if (mayAppend) {
    text = `${text}\n\nWhat would you like to do next?`;
  }

  return text;
}
