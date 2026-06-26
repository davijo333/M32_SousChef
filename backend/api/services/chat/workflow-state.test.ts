import assert from "node:assert/strict";
import test from "node:test";

import { mergeAgentWorkflowState } from "./workflow-state.ts";

test("mergeAgentWorkflowState clears when agent returns null", () => {
  const current = {
    workflowId: "link_addons_to_dish_chat",
    stepId: "confirm_link",
    lockedName: "Pancakes",
    baggage: { addon_name: "glazed bananas" },
  };

  assert.equal(mergeAgentWorkflowState(current, null), null);
});

test("mergeAgentWorkflowState keeps current when agent omits state", () => {
  const current = {
    workflowId: "link_addons_to_dish_chat",
    stepId: "confirm_link",
    lockedName: "Pancakes",
  };

  assert.equal(mergeAgentWorkflowState(current, undefined), current);
});
