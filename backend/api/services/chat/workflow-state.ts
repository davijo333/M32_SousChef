/** Persisted Sous Chef workflow step — mirrors agent-service workflow_engine. */

export type WorkflowStatePayload = {
  workflowId: string;
  stepId: string;
  lockedName?: string;
  gatesPassed?: string[];
  baggage?: Record<string, unknown>;
};

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
  return false;
}
