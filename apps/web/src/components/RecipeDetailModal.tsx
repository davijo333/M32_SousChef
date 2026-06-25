"use client";

import {
  suggestionNoteLabel,
  type SuggestionNote,
  type SuggestionNoteKind,
} from "@backend/services/creative/suggestion-notes";
import { formatClassificationLabel } from "@backend/services/catalog/catalog-classification";

export type RecipeLink = {
  ingredientSlug: string;
  ingredientName: string;
  imageUrl?: string;
  qtyPerServing: number;
  unit: string;
  scalesWithSize?: boolean;
  notes?: string;
  inPantry: boolean;
};

export type RecipeMeta = {
  recipeNumber: number;
  servingQty: number;
  foodCost: number;
  margin: number;
  sellPrice: number;
  progress: "linking" | "pricing" | "ready" | "failed";
  progressMessage?: string;
  ingredients: Array<{
    ingredientSlug: string;
    ingredientName: string;
    qtyUsed: number;
    unit: string;
  }>;
  instructions?: string[];
};

export type RecipeModalItem =
  | {
      kind: "dish";
      slug: string;
      name: string;
      classification: string;
      sellPrice: number;
      imageUrl?: string;
      ingredientLinks: RecipeLink[];
      recipe?: RecipeMeta;
      suggestionNotes?: SuggestionNote[];
    }
  | {
      kind: "addon";
      slug: string;
      name: string;
      classification: string;
      sellPrice: number;
      linkedDishNames: string[];
      ingredientLinks: RecipeLink[];
      recipe?: RecipeMeta;
    };

type Props = {
  item: RecipeModalItem;
  tab: "new" | "active" | "inactive" | "suggested";
  showCheckbox?: boolean;
  selected?: boolean;
  onSelect?: (value: boolean) => void;
  onClose: () => void;
  onRetire?: () => void;
  onAccept?: () => void;
  onReject?: () => void;
  onRevive?: () => void;
  onDelete?: () => void;
  actionBusy?: boolean;
};

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

function noteBadgeClass(kind: SuggestionNoteKind): string {
  switch (kind) {
    case "expiring_ingredients":
      return "border-chef-amber/50 bg-chef-amber-light/60 text-chef-text";
    case "seasonal":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "high_margin":
      return "border-chef-sage/40 bg-chef-sage-light/50 text-chef-sage-dark";
    case "low_stock":
      return "border-orange-200 bg-orange-50 text-orange-900";
    case "cue":
      return "border-sky-200 bg-sky-50 text-sky-900";
    default:
      return "border-chef-border bg-chef-muted/60 text-chef-text";
  }
}

function RecipeLinkList({ links }: { links: RecipeLink[] }) {
  if (!links.length) {
    return (
      <p className="mt-2 text-sm text-chef-text-muted">
        No ingredients linked yet. Process a purchase order after uploading sales orders to
        auto-generate recipes.
      </p>
    );
  }

  return (
    <ul className="mt-2 space-y-1.5">
      {links.map((link) => (
        <li
          key={link.ingredientSlug}
          className="flex items-center gap-2 rounded-lg bg-chef-muted/60 px-3 py-2 text-sm text-chef-text"
        >
          {link.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={link.imageUrl}
              alt=""
              className="h-8 w-8 shrink-0 rounded-md object-cover"
            />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-chef-muted text-xs text-chef-text-muted">
              🥬
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="font-medium">{link.ingredientName}</span>
            <span className="text-chef-text-muted">
              {" "}
              — {link.qtyPerServing} {link.unit}
              {link.scalesWithSize === false ? " (fixed)" : ""}
            </span>
            {!link.inPantry && (
              <span className="ml-1 text-xs font-semibold uppercase text-chef-amber">missing</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function RecipeDetailModal({
  item,
  tab,
  showCheckbox,
  selected,
  onSelect,
  onClose,
  onRetire,
  onAccept,
  onReject,
  onRevive,
  onDelete,
  actionBusy,
}: Props) {
  const recipe = item.recipe;
  const inProgress = recipe && recipe.progress !== "ready" && recipe.progress !== "failed";
  const sellPrice = recipe?.sellPrice ?? item.sellPrice;
  const links =
    recipe?.ingredients?.length
      ? recipe.ingredients.map((ing) => ({
          ingredientSlug: ing.ingredientSlug,
          ingredientName: ing.ingredientName,
          qtyPerServing: ing.qtyUsed,
          unit: ing.unit,
          inPantry: item.ingredientLinks.some(
            (l) => l.ingredientSlug === ing.ingredientSlug && l.inPantry
          ),
        }))
      : item.ingredientLinks;

  const subtitle =
    item.kind === "addon"
      ? `Add-on · ${formatClassificationLabel(item.classification)}${
          item.linkedDishNames.length ? ` · for ${item.linkedDishNames.join(", ")}` : ""
        }`
      : formatClassificationLabel(item.classification);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-chef-text/30 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[min(90vh,44rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-chef-border bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recipe-detail-title"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-chef-border bg-white px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="recipe-detail-title" className="text-lg font-semibold text-chef-text">
              {item.name}
            </h2>
            <p className="mt-1 text-sm text-chef-text-muted">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-2 py-1 text-sm text-chef-text-muted hover:bg-chef-muted hover:text-chef-text"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-5">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt=""
              className="mx-auto h-40 w-40 rounded-xl border border-chef-border object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-xl border border-chef-border bg-chef-muted text-4xl text-chef-text-muted/50">
              🍽
            </div>
          )}

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase text-chef-text-muted">Sell price</dt>
              <dd className="font-medium text-chef-text">{formatMoney(sellPrice)}</dd>
            </div>
            {recipe && (
              <>
                <div>
                  <dt className="text-xs uppercase text-chef-text-muted">Recipe #</dt>
                  <dd className="font-medium text-chef-text">{recipe.recipeNumber}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-chef-text-muted">Qty / serving</dt>
                  <dd className="font-medium text-chef-text">{recipe.servingQty}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-chef-text-muted">Food cost</dt>
                  <dd className="font-medium text-chef-text">{formatMoney(recipe.foodCost)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-chef-text-muted">Margin</dt>
                  <dd className="font-medium text-chef-text">{(recipe.margin * 100).toFixed(0)}%</dd>
                </div>
              </>
            )}
            <div>
              <dt className="text-xs uppercase text-chef-text-muted">Ingredients</dt>
              <dd className="font-medium text-chef-text">{item.ingredientLinks.length}</dd>
            </div>
          </dl>

          {item.kind === "dish" && item.suggestionNotes && item.suggestionNotes.length > 0 && (
            <>
              <p className="mt-5 text-xs font-medium uppercase tracking-wide text-chef-text-muted">
                Why suggested
              </p>
              <ul className="mt-2 space-y-2">
                {item.suggestionNotes.map((note, index) => (
                  <li
                    key={`${note.kind}-${index}`}
                    className={`rounded-lg border px-3 py-2 text-sm ${noteBadgeClass(note.kind)}`}
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide opacity-80">
                      {suggestionNoteLabel(note.kind)}
                    </span>
                    <p className="mt-0.5 leading-snug">{note.text}</p>
                  </li>
                ))}
              </ul>
            </>
          )}

          {inProgress && (
            <p className="mt-4 flex items-center gap-2 text-sm text-chef-sage">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-chef-sage border-t-transparent" />
              {recipe?.progressMessage ??
                (recipe?.progress === "linking"
                  ? "Linking ingredients…"
                  : "Computing cost and sell price…")}
            </p>
          )}

          <p className="mt-5 text-xs font-medium uppercase tracking-wide text-chef-text-muted">
            Ingredients linked
          </p>
          <RecipeLinkList links={links} />

          {recipe?.instructions?.length ? (
            <>
              <p className="mt-5 text-xs font-medium uppercase tracking-wide text-chef-text-muted">
                Instructions
              </p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-chef-text">
                {recipe.instructions.map((step, index) => (
                  <li key={`${index}-${step.slice(0, 24)}`}>{step}</li>
                ))}
              </ol>
            </>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-chef-border pt-4">
            {showCheckbox && onSelect && (
              <label className="mr-auto flex items-center gap-2 text-sm text-chef-text">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(event) => onSelect(event.target.checked)}
                  className="h-4 w-4 accent-chef-sage"
                />
                Select for activation
              </label>
            )}
            {tab === "active" && onRetire && (
              <button
                type="button"
                onClick={onRetire}
                className="rounded-lg border border-chef-border bg-white px-4 py-2 text-sm font-medium text-chef-text hover:bg-chef-muted"
              >
                Retire
              </button>
            )}
            {tab === "suggested" && onAccept && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={onAccept}
                className="rounded-lg bg-chef-sage px-4 py-2 text-sm font-medium text-white hover:bg-chef-sage-dark disabled:opacity-50"
              >
                {actionBusy ? "Saving…" : "Accept"}
              </button>
            )}
            {tab === "suggested" && onReject && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={onReject}
                className="rounded-lg border border-chef-border bg-white px-4 py-2 text-sm font-medium text-chef-text hover:bg-chef-muted disabled:opacity-50"
              >
                {actionBusy ? "Saving…" : "Reject"}
              </button>
            )}
            {tab === "inactive" && (onDelete || onRevive) && (
              <div className="ml-auto flex flex-wrap gap-2">
                {onDelete && (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={onDelete}
                    className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {actionBusy ? "Deleting…" : "Delete"}
                  </button>
                )}
                {onRevive && (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={onRevive}
                    className="rounded-lg bg-chef-sage px-4 py-2 text-sm font-medium text-white hover:bg-chef-sage-dark disabled:opacity-50"
                  >
                    {actionBusy ? "Saving…" : "Revive"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
