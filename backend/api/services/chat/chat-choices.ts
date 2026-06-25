import type { ChatCatalogDraftPayload } from "@backend/services/chat/chat-recipe-draft";
import type { RecipeBuildPlanPayload } from "@backend/services/recipes/recipe-build-plan";

/** One selectable option in chat (MCQ / confirm bar). */
export type ChatChoice = {
  id: string;
  label: string;
  message: string;
  description?: string;
};

export type ChatChoiceSet = {
  prompt?: string;
  choices: ChatChoice[];
};

/**
 * Chat confirmations are prose-only (golden workflow). No Confirm/Cancel chips.
 */
export function deriveChatChoices(_params: {
  catalogDraft?: ChatCatalogDraftPayload | null;
  recipeBuildPlan?: RecipeBuildPlanPayload | null;
  kitchenBuildComplete?: boolean;
  messages?: Array<{ role: string; content: string }>;
  consultedAgents?: Array<"inventory" | "business" | "create">;
}): ChatChoiceSet | null {
  return null;
}
