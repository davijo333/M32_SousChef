/** Persisted Sous Chef workflow step — mirrors agent-service-v1 workflow engine. */

export type WorkflowStatePayload = {
  workflowId: string;
  stepId: string;
  lockedName?: string;
  gatesPassed?: string[];
  baggage?: Record<string, unknown>;
};

export const LINK_CHAT_WORKFLOW_IDS = new Set([
  "link_dish_ingredients_chat",
  "link_addon_ingredients_chat",
  "link_addons_to_dish_chat",
]);

export function isLinkChatWorkflow(state: WorkflowStatePayload | null): boolean {
  return Boolean(state?.workflowId && LINK_CHAT_WORKFLOW_IDS.has(state.workflowId));
}

export function isLinkChatConfirmStep(state: WorkflowStatePayload | null): boolean {
  if (!isLinkChatWorkflow(state) || !state?.stepId) return false;
  return state.stepId === "confirm_link" || state.stepId === "confirm_new_ingredients";
}

/** Thread is at a link add-on → dish confirm gate (not kitchen build). */
export function threadAwaitingLinkConfirmGate(
  messages: Array<{ role: string; content: string }>
): boolean {
  const lastAssistant = [...messages]
    .reverse()
    .find((row) => row.role === "assistant")?.content;
  if (!lastAssistant?.trim()) return false;
  return /\bready to link\b/i.test(lastAssistant);
}

/** Apply agent workflow_state — explicit null clears persisted step baggage. */
export function mergeAgentWorkflowState(
  current: WorkflowStatePayload | null,
  agentState: WorkflowStatePayload | null | undefined
): WorkflowStatePayload | null {
  if (agentState === undefined) return current;
  if (agentState === null) return null;
  return normalizeWorkflowState(agentState) ?? current;
}

export function normalizeWorkflowState(raw: unknown): WorkflowStatePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const workflowId = String(row.workflowId ?? row.workflow_id ?? "").trim();
  const stepId = String(row.stepId ?? row.step_id ?? "").trim();
  if (!workflowId || !stepId) return null;
  const lockedName = String(row.lockedName ?? row.locked_name ?? "").trim() || undefined;
  const gatesRaw = row.gatesPassed ?? row.gates_passed;
  const gatesPassed = Array.isArray(gatesRaw)
    ? gatesRaw.map((g) => String(g).trim()).filter(Boolean)
    : undefined;
  const baggageRaw = row.baggage;
  const baggage =
    baggageRaw && typeof baggageRaw === "object" && !Array.isArray(baggageRaw)
      ? (baggageRaw as Record<string, unknown>)
      : undefined;
  return { workflowId, stepId, lockedName, gatesPassed, baggage };
}

/** Active add-dish write workflow — route all confirms through the agent executor. */
export function isActiveAddDishWorkflow(state: WorkflowStatePayload | null): boolean {
  return state?.workflowId === "add_dish_from_chat";
}

/** Active write workflow at a chef-confirm gate — do not append follow-up questions. */
export function isWorkflowConfirmGate(state: WorkflowStatePayload | null): boolean {
  if (!state) return false;
  const { workflowId, stepId } = state;
  if (workflowId === "add_dish_from_chat") {
    return (
      stepId === "pick_dish" ||
      stepId === "confirm_dish_identity" ||
      stepId === "confirm_new_ingredients" ||
      stepId === "draft_recipe" ||
      stepId === "confirm_recipe" ||
      stepId === "confirm_finalize"
    );
  }
  if (workflowId === "add_ingredient_from_chat" || workflowId === "add_addon_from_chat") {
    return stepId === "confirm_create";
  }
  if (isLinkChatWorkflow(state)) {
    return isLinkChatConfirmStep(state);
  }
  return false;
}
