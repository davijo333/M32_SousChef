import type { RecipeBuildPlanPayload } from "@backend/services/recipes/recipe-build-plan";
import type { ChatCatalogDraftPayload } from "@backend/services/chat/chat-catalog-draft";
import type { ChatUploadBatchPayload } from "@backend/services/chat/chat-bill-upload-queue";
import type { DashboardChatContext } from "@backend/services/agents/dashboard-chat";
import type { SpecialistHandoffTarget } from "@backend/services/agents/chat-handoff";
import type { AgentPendingAction, AgentNavigationAction } from "@backend/services/agents/agent-pending-actions";
import type { SuggestionNote } from "@backend/services/creative/suggestion-notes";
import type { WorkflowStatePayload } from "@backend/services/chat/workflow-state";

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";

export type AgentChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AgentChatRequest = {
  restaurantId: string;
  userId: string;
  chefName: string;
  restaurantName: string;
  message: string;
  context: DashboardChatContext;
  agentContext: DashboardChatContext;
  connectAgent?: SpecialistHandoffTarget | null;
  history: AgentChatMessage[];
  financePeriod: string;
  cuesText?: string;
  recentBillIds?: string[];
  uploadBatch?: ChatUploadBatchPayload;
  catalogDraft?: ChatCatalogDraftPayload;
  recipeBuild?: RecipeBuildPlanPayload;
  confirmSuggestion?: boolean;
  confirmInventory?: boolean;
  confirmBusiness?: boolean;
  workflowState?: WorkflowStatePayload | null;
};

export type AgentChatResponse = {
  reply: string;
  agentContext: DashboardChatContext;
  handoff: SpecialistHandoffTarget | null;
  suggestionAction: {
    name: string;
    description: string;
    classification: string;
    ingredientSlugs?: string[];
    notes?: SuggestionNote[];
  } | null;
  pendingAction: AgentPendingAction | null;
  navigationAction: AgentNavigationAction | null;
  recipeBuildPlan: RecipeBuildPlanPayload | null;
  activity: {
    orchestrator: "head";
    consultedAgents: Array<"inventory" | "business" | "create">;
  } | null;
  workflowState: WorkflowStatePayload | null;
};

export async function callLangChainAgentChat(
  payload: AgentChatRequest
): Promise<AgentChatResponse | null> {
  try {
    const res = await fetch(`${AGENT_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurant_id: payload.restaurantId,
        user_id: payload.userId,
        chef_name: payload.chefName,
        restaurant_name: payload.restaurantName,
        message: payload.message,
        context: payload.context,
        agent_context: payload.agentContext,
        connect_agent: payload.connectAgent ?? null,
        history: payload.history,
        finance_period: payload.financePeriod,
        cues_text: payload.cuesText ?? "",
        recent_bill_ids: payload.recentBillIds ??
          payload.uploadBatch?.slices.flatMap((slice) => slice.readyBillIds) ??
          [],
        upload_batch: payload.uploadBatch ?? null,
        catalog_draft: payload.catalogDraft ?? null,
        recipe_build: payload.recipeBuild ?? null,
        confirm_suggestion: Boolean(payload.confirmSuggestion),
        confirm_inventory: Boolean(payload.confirmInventory),
        confirm_business: Boolean(payload.confirmBusiness),
        workflow_state: payload.workflowState ?? null,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      console.error("LangChain agent chat failed:", res.status, await res.text());
      return null;
    }

    const data = (await res.json()) as {
      reply: string;
      agent_context: DashboardChatContext;
      handoff?: SpecialistHandoffTarget | null;
      suggestion_action?: {
        name: string;
        description: string;
        classification: string;
        ingredientSlugs?: string[];
        notes?: SuggestionNote[];
      } | null;
      pending_action?: AgentPendingAction | null;
      navigation_action?: AgentNavigationAction | null;
      recipe_build?: RecipeBuildPlanPayload | null;
      activity?: {
        orchestrator?: "head";
        consulted_agents?: Array<"inventory" | "business" | "create">;
      } | null;
      workflow_state?: WorkflowStatePayload | null;
    };

    return {
      reply: data.reply,
      agentContext: data.agent_context,
      handoff: data.handoff ?? null,
      suggestionAction: data.suggestion_action
        ? {
            name: data.suggestion_action.name,
            description: data.suggestion_action.description,
            classification: data.suggestion_action.classification,
            ingredientSlugs: data.suggestion_action.ingredientSlugs,
            notes: data.suggestion_action.notes,
          }
        : null,
      pendingAction: data.pending_action ?? null,
      navigationAction: data.navigation_action ?? null,
      recipeBuildPlan: data.recipe_build ?? null,
      activity: data.activity
        ? {
            orchestrator: "head",
            consultedAgents: data.activity.consulted_agents ?? [],
          }
        : null,
      workflowState: data.workflow_state ?? null,
    };
  } catch (err) {
    console.error("LangChain agent chat error:", err);
    return null;
  }
}
