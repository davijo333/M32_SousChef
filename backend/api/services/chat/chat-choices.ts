import type { ChatCatalogDraftPayload } from "@backend/services/chat/chat-catalog-draft";
import type { RecipeBuildPlanPayload } from "@backend/services/recipes/recipe-build-plan";
import { isRecipeBuildReadyToFinalize } from "@backend/services/recipes/recipe-build-plan";

/** One selectable option in chat (MCQ / confirm bar). */
export type ChatChoice = {
  id: string;
  label: string;
  /** Message sent to the agent when this choice is confirmed (Enter or submit). */
  message: string;
  description?: string;
};

export type ChatChoiceSet = {
  /** Short label above the options, e.g. "Add to your kitchen?" */
  prompt?: string;
  choices: ChatChoice[];
};

/**
 * Build structured choices when the workflow state is clear enough to offer MCQ.
 * Uncertain states should return null so the agent asks in prose instead.
 */
export function deriveChatChoices(params: {
  catalogDraft?: ChatCatalogDraftPayload | null;
  recipeBuildPlan?: RecipeBuildPlanPayload | null;
  kitchenBuildComplete?: boolean;
}): ChatChoiceSet | null {
  if (params.kitchenBuildComplete) return null;

  const plan = params.recipeBuildPlan;
  if (plan && isRecipeBuildReadyToFinalize(plan)) {
    return {
      prompt: `Ready to add **${plan.dishName}** to your kitchen?`,
      choices: [
        {
          id: "confirm_build",
          label: "Go ahead — add to kitchen",
          message: "Go ahead — add the dish, ingredients, and recipe",
        },
        {
          id: "revise",
          label: "Change something first",
          message: "I want to change something in this recipe before adding it",
        },
        {
          id: "cancel",
          label: "Not now",
          message: "Not now — leave this as a draft",
        },
      ],
    };
  }

  if (plan?.status === "selecting") {
    const needsPick = plan.ingredients.some(
      (row) =>
        !row.committedSlug &&
        !row.pantrySlug &&
        !row.selectedOption &&
        (row.options?.length ?? 0) > 0
    );
    // Step-by-step picker handles ingredient MCQ — skip duplicate confirm chip.
    if (needsPick) return null;
  }

  const draft = params.catalogDraft;
  if (draft?.itemType === "dish" && !plan) {
    return {
      prompt: `Add **${draft.name}** to your kitchen?`,
      choices: [
        {
          id: "full_build",
          label: "Yes — dish, ingredients & recipe",
          message: "Yes — create the dish, ingredients, and recipe",
        },
        {
          id: "rename",
          label: "Change the name",
          message: "I want to change the dish name",
        },
        {
          id: "description",
          label: "Change the description",
          message: "I want to change the description",
        },
        {
          id: "later",
          label: "Not now",
          message: "Not now",
        },
      ],
    };
  }

  return null;
}
