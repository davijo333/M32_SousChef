"use client";

import {
  formatRecipeBuildSelectionSummary,
  isRecipeBuildReadyToFinalize,
  type RecipeBuildPlanPayload,
} from "@backend/services/recipes/recipe-build-plan";

type RecipeBuildPickerProps = {
  plan: RecipeBuildPlanPayload;
  disabled: boolean;
  onFinalize: (plan: RecipeBuildPlanPayload) => void;
};

export function RecipeBuildPicker({ plan, disabled, onFinalize }: RecipeBuildPickerProps) {
  const canSubmit = isRecipeBuildReadyToFinalize(plan);

  const pantryRows = plan.ingredients.filter((row) => row.committedSlug || row.pantrySlug);
  const newRows = plan.ingredients.filter((row) => !row.committedSlug && !row.pantrySlug);

  return (
    <div className="rounded-xl border border-chef-sage/40 bg-chef-sage/5 p-3 space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-medium text-chef-text-muted">Recipe build — {plan.dishName}</p>
        <p className="text-xs text-chef-text-muted">
          Confirm ingredients below — pantry photos and dish images generate automatically in Kitchen
          control (no image picking in chat).
        </p>
      </div>

      {plan.visualBrief?.trim() ? (
        <div className="rounded-lg border border-chef-border bg-white/80 p-2.5 text-xs text-chef-text">
          <p className="font-medium text-chef-text-muted">Visual brief</p>
          <p className="mt-1 whitespace-pre-line">{plan.visualBrief.trim()}</p>
        </div>
      ) : null}

      {pantryRows.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-chef-text-muted">
            Already in pantry
          </p>
          <ul className="list-inside list-disc text-xs text-chef-text-muted">
            {pantryRows.map((row) => (
              <li key={row.key}>
                {row.name} — {row.qtyPerServing} {row.unit}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {newRows.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-chef-text-muted">
            New pantry items (qty 0)
          </p>
          <ul className="list-inside list-disc text-xs text-chef-text-muted">
            {newRows.map((row) => (
              <li key={row.key}>
                {row.name} — {row.qtyPerServing} {row.unit}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canSubmit ? (
        <div className="rounded-lg border border-chef-border bg-white/80 p-2.5 text-xs text-chef-text whitespace-pre-line">
          {formatRecipeBuildSelectionSummary(plan)}
        </div>
      ) : null}

      <div className="space-y-1.5 pt-1">
        <button
          type="button"
          disabled={disabled || !canSubmit}
          onClick={() => onFinalize(plan)}
          className="sc-btn-primary w-full py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add to Kitchen (ingredients, dish, recipe & photos)
        </button>
      </div>
    </div>
  );
}
