"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AddCatalogItemModal } from "@/components/AddCatalogItemModal";
import { CatalogItemCard } from "@/components/CatalogItemCard";
import { addCatalogItemToKitchen, countIncludedForAdd, relinkBillsForItems } from "@backend/services/catalog/catalog-add";
import type { NewCatalogItem } from "@backend/services/catalog/extract-new-items";
import {
  applySuggestedImages,
  countSuggestedAssignable,
} from "@backend/services/catalog/image-selection";

type Props = {
  newIngredients: NewCatalogItem[];
  newDishes: NewCatalogItem[];
  missingIngredients?: NewCatalogItem[];
  onIngredientAdded: (id: string, billId?: string) => void;
  onDishAdded: (id: string, billId?: string) => void;
  onMissingIngredientAdded?: (id: string) => void;
  onIngredientsChange: (items: NewCatalogItem[]) => void;
  onDishesChange: (items: NewCatalogItem[]) => void;
  onMissingIngredientsChange?: (items: NewCatalogItem[]) => void;
  onBillsProcessed: (billIds: string[]) => void;
  onItemsAdded?: (itemIds: string[]) => void;
};

function ScrollRow({
  title,
  subtitle,
  kind,
  items,
  onToggleIncluded,
  onConfirmItem,
  cardVariant = "default",
}: {
  title: string;
  subtitle: string;
  kind: "ingredient" | "dish";
  items: NewCatalogItem[];
  onToggleIncluded: (id: string, included: boolean) => void;
  onConfirmItem: (item: NewCatalogItem) => void;
  cardVariant?: "default" | "missing";
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollHints = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(maxScroll > 8 && el.scrollLeft < maxScroll - 8);
  }, []);

  useEffect(() => {
    updateScrollHints();
    const el = scrollerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateScrollHints);
    observer.observe(el);
    return () => observer.disconnect();
  }, [items.length, updateScrollHints]);

  const scrollByCards = (direction: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(280, el.clientWidth * 0.75), behavior: "smooth" });
    window.setTimeout(updateScrollHints, 320);
  };

  if (items.length === 0) return null;

  const showArrows = items.length > 1;

  return (
    <section>
      <div className="mb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-chef-text">{title}</h3>
          <span className={`rounded-full px-3 py-0.5 text-sm font-medium ${
            cardVariant === "missing"
              ? "bg-red-100 text-red-700"
              : "bg-chef-amber-light text-chef-amber"
          }`}>
            {items.length} to review
          </span>
        </div>
        <p className="mt-0.5 text-sm text-chef-text-muted">{subtitle}</p>
      </div>
      <div className="relative">
        {showArrows && canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollByCards(-1)}
            className="absolute left-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-chef-border bg-chef-surface/95 text-chef-text shadow-md hover:bg-chef-sage-light"
            aria-label={`Scroll ${title} left`}
          >
            ‹
          </button>
        )}
        {showArrows && canScrollRight && (
          <button
            type="button"
            onClick={() => scrollByCards(1)}
            className="absolute right-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-chef-border bg-chef-surface/95 text-chef-text shadow-md hover:bg-chef-sage-light"
            aria-label={`Scroll ${title} right`}
          >
            ›
          </button>
        )}
        <div
          ref={scrollerRef}
          onScroll={updateScrollHints}
          className={`flex gap-3 overflow-x-auto pb-1 scroll-smooth ${showArrows ? "px-10" : ""}`}
        >
          {items.map((item) => (
            <CatalogItemCard
              key={item.id}
              item={item}
              kind={kind}
              variant={cardVariant}
              included={item.includedForAdd !== false}
              onToggleIncluded={(included) => onToggleIncluded(item.id, included)}
              onConfirm={() => onConfirmItem(item)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export function NewItemsReview({
  newIngredients,
  newDishes,
  missingIngredients = [],
  onIngredientAdded,
  onDishAdded,
  onMissingIngredientAdded,
  onIngredientsChange,
  onDishesChange,
  onMissingIngredientsChange,
  onBillsProcessed,
  onItemsAdded,
}: Props) {
  const [modal, setModal] = useState<{
    item: NewCatalogItem;
    type: "ingredient" | "dish";
  } | null>(null);
  const [addingAll, setAddingAll] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });

  if (newIngredients.length === 0 && newDishes.length === 0 && missingIngredients.length === 0) {
    return null;
  }

  const total = newIngredients.length + newDishes.length + missingIngredients.length;
  const allItems = [...newIngredients, ...newDishes, ...missingIngredients];
  const assignable = countSuggestedAssignable(allItems);
  const assignedCount = allItems.filter((item) => item.selectedImageUrl).length;
  const includedCount =
    countIncludedForAdd(newIngredients) +
    countIncludedForAdd(newDishes) +
    countIncludedForAdd(missingIngredients);
  const skippedCount = total - includedCount;

  function handleApplySuggested() {
    onIngredientsChange(applySuggestedImages(newIngredients));
    onDishesChange(applySuggestedImages(newDishes));
  }

  function toggleIncluded(
    type: "ingredient" | "dish" | "missing",
    id: string,
    included: boolean
  ) {
    const patch = (items: NewCatalogItem[]) =>
      items.map((item) => (item.id === id ? { ...item, includedForAdd: included } : item));

    if (type === "ingredient") onIngredientsChange(patch(newIngredients));
    else if (type === "missing") onMissingIngredientsChange?.(patch(missingIngredients));
    else onDishesChange(patch(newDishes));
  }

  function handleImageSelectionChange(
    itemId: string,
    type: "ingredient" | "dish",
    url: string,
    manual: boolean
  ) {
    const patch = (items: NewCatalogItem[]) =>
      items.map((item) =>
        item.id === itemId
          ? { ...item, selectedImageUrl: url, imageSelectionManual: manual }
          : item
      );

    if (type === "ingredient") {
      onIngredientsChange(patch(newIngredients));
    } else {
      onDishesChange(patch(newDishes));
    }

    setModal((prev) =>
      prev && prev.item.id === itemId
        ? {
            ...prev,
            item: {
              ...prev.item,
              selectedImageUrl: url,
              imageSelectionManual: manual,
            },
          }
        : prev
    );
  }

  async function handleAddAllIncluded() {
    const queue: Array<{ item: NewCatalogItem; type: "ingredient" | "dish" | "missing" }> = [
      ...newIngredients
        .filter((item) => item.includedForAdd !== false)
        .map((item) => ({ item, type: "ingredient" as const })),
      ...missingIngredients
        .filter((item) => item.includedForAdd !== false)
        .map((item) => ({ item, type: "missing" as const })),
      ...newDishes
        .filter((item) => item.includedForAdd !== false)
        .map((item) => ({ item, type: "dish" as const })),
    ];

    if (!queue.length) return;

    setAddingAll(true);
    setBulkError("");
    setBulkProgress({ done: 0, total: queue.length });

    const failures: string[] = [];
    const successIds: string[] = [];
    const addedItems: NewCatalogItem[] = [];
    const billIds = Array.from(
      new Set(queue.map((q) => q.item.billId).filter(Boolean))
    );

    for (let i = 0; i < queue.length; i++) {
      const { item, type } = queue[i];
      const withImages = applySuggestedImages([item])[0];
      const result = await addCatalogItemToKitchen(withImages);

      if (result.ok) {
        successIds.push(item.id);
        if (type === "dish" || type === "ingredient") addedItems.push(withImages);
        if (type === "missing") onMissingIngredientAdded?.(item.id);
      } else {
        failures.push(`${item.name}: ${result.error}`);
      }

      setBulkProgress({ done: i + 1, total: queue.length });
    }

    if (addedItems.length) {
      await relinkBillsForItems(addedItems);
    }

    if (successIds.length > 0) {
      onItemsAdded?.(successIds);
      if (billIds.length) onBillsProcessed(billIds);
    }

    setAddingAll(false);

    if (failures.length) {
      setBulkError(
        failures.length === queue.length
          ? "Could not add items. Open a card to review details."
          : `Some items could not be added: ${failures.slice(0, 3).join("; ")}${failures.length > 3 ? "…" : ""}`
      );
    }
  }

  return (
    <>
      <div className="sc-card border-chef-sage/20 bg-gradient-to-br from-chef-sage-light/80 to-chef-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="sc-section-title">New items from your bills</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-chef-text-muted">
              All items are <strong className="font-semibold text-chef-text">selected to add</strong>{" "}
              with suggested photos. Uncheck any you want to skip, then tap{" "}
              <strong className="font-semibold text-chef-text">Add all to kitchen</strong> — or open a
              card to review one at a time.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handleApplySuggested}
              disabled={assignable === 0}
              className="sc-btn-secondary border-chef-sage/30 bg-chef-sage-light/50 text-chef-sage-dark hover:bg-chef-sage-light disabled:opacity-50"
            >
              Default with suggested images
            </button>
            <button
              type="button"
              onClick={handleAddAllIncluded}
              disabled={addingAll || includedCount === 0}
              className="sc-btn-primary disabled:opacity-50"
            >
              {addingAll
                ? `Adding… (${bulkProgress.done}/${includedCount})`
                : `Add all to kitchen (${includedCount})`}
            </button>
          </div>
        </div>

        {addingAll && bulkProgress.total > 0 && (
          <div className="mt-4" role="status" aria-live="polite">
            <div className="mb-1.5 flex items-center justify-between text-sm text-chef-text-muted">
              <span>Saving items to your kitchen…</span>
              <span>
                {bulkProgress.done} / {bulkProgress.total}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-chef-border">
              <div
                className="h-full rounded-full bg-chef-sage transition-[width] duration-300 ease-out"
                style={{
                  width: `${Math.round((bulkProgress.done / bulkProgress.total) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-chef-sage-dark">
          <span>
            <strong className="font-semibold">{includedCount}</strong> selected to add
          </span>
          {skippedCount > 0 && (
            <span>
              <strong className="font-semibold">{skippedCount}</strong> skipped
            </span>
          )}
          {assignedCount > 0 && (
            <span>
              <strong className="font-semibold">{assignedCount}</strong> with photos
            </span>
          )}
        </div>

        {bulkError && <p className="mt-3 text-sm text-red-700">{bulkError}</p>}

        <div className="mt-5 space-y-6">
          <ScrollRow
            title="Missing recipe ingredients"
            subtitle="Sold dishes link to these — add them so stock can be deducted from saved sales"
            kind="ingredient"
            cardVariant="missing"
            items={missingIngredients}
            onToggleIncluded={(id, included) => toggleIncluded("missing", id, included)}
            onConfirmItem={(item) => setModal({ item, type: "ingredient" })}
          />
          <ScrollRow
            title="Ingredients"
            subtitle="Products from supplier invoices (Costco, Sysco, etc.)"
            kind="ingredient"
            items={newIngredients}
            onToggleIncluded={(id, included) => toggleIncluded("ingredient", id, included)}
            onConfirmItem={(item) => setModal({ item, type: "ingredient" })}
          />
          <ScrollRow
            title="Menu items"
            subtitle="Dishes from customer receipts — add to your menu; recipe links are optional"
            kind="dish"
            items={newDishes}
            onToggleIncluded={(id, included) => toggleIncluded("dish", id, included)}
            onConfirmItem={(item) => setModal({ item, type: "dish" })}
          />
        </div>
      </div>

      {modal && (
        <AddCatalogItemModal
          item={modal.item}
          itemType={modal.type}
          onClose={() => setModal(null)}
          onAdded={(id) => {
            if (modal.type === "ingredient") {
              if (modal.item.id.startsWith("missing-")) onMissingIngredientAdded?.(id);
              else onIngredientAdded(id, modal.item.billId);
            } else onDishAdded(id, modal.item.billId);
            setModal(null);
          }}
          onImageSelectionChange={(url, manual) =>
            handleImageSelectionChange(modal.item.id, modal.type, url, manual)
          }
        />
      )}
    </>
  );
}
