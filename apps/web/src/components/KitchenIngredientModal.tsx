"use client";

import { useCallback, useEffect, useState } from "react";
import { isValidProductImageUrl } from "@/lib/image-selection";

export type IngredientDetail = {
  slug: string;
  sku?: string;
  name: string;
  imageUrl?: string;
  imageCandidates?: Array<{ url: string; label?: string; source?: string; score?: number }>;
  selectedImageIndex?: number;
  imageGenerationAttempted?: boolean;
  brandName?: string;
  lastPurchasePrice?: number;
  lastOrderedQty?: number;
  currentQty: number;
  inventoryUnit: string;
  reorderThreshold: number;
};

type Props = {
  item: IngredientDetail;
  onClose: () => void;
  onSaved?: (updated: IngredientDetail) => void;
};

type ImageCandidate = NonNullable<IngredientDetail["imageCandidates"]>[number];

function Field({
  label,
  children,
  compact,
}: {
  label: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <label className={`block ${compact ? "text-xs" : "text-sm"}`}>
      <span className="text-chef-text-muted">{label}</span>
      <div className={compact ? "mt-0.5" : "mt-1"}>{children}</div>
    </label>
  );
}

const inputClass =
  "w-full min-w-0 rounded-lg border border-chef-muted bg-white px-2 py-1.5 text-sm text-chef-text";

function normalizeCandidates(
  imageCandidates: ImageCandidate[] | undefined,
  imageUrl?: string
): ImageCandidate[] {
  const fromDb = (imageCandidates ?? []).filter((c) => isValidProductImageUrl(c.url));
  if (fromDb.length) return fromDb.slice(0, 2);
  if (imageUrl && isValidProductImageUrl(imageUrl)) return [{ url: imageUrl }];
  return [];
}

export function KitchenIngredientModal({ item, onClose, onSaved }: Props) {
  const [name, setName] = useState(item.name);
  const [brandName, setBrandName] = useState(item.brandName ?? "");
  const [sku, setSku] = useState(item.sku ?? item.slug);
  const [currentQty, setCurrentQty] = useState(String(item.currentQty));
  const [reorderThreshold, setReorderThreshold] = useState(String(item.reorderThreshold));
  const [lastPurchasePrice, setLastPurchasePrice] = useState(
    item.lastPurchasePrice != null ? String(item.lastPurchasePrice) : ""
  );
  const [lastOrderedQty, setLastOrderedQty] = useState(
    item.lastOrderedQty != null ? String(item.lastOrderedQty) : ""
  );
  const [candidates, setCandidates] = useState<ImageCandidate[]>(() =>
    normalizeCandidates(item.imageCandidates, item.imageUrl)
  );
  const [selectedImageIndex, setSelectedImageIndex] = useState(item.selectedImageIndex ?? 0);
  const [imageGenerationAttempted, setImageGenerationAttempted] = useState(
    item.imageGenerationAttempted ?? false
  );
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setName(item.name);
    setBrandName(item.brandName ?? "");
    setSku(item.sku ?? item.slug);
    setCurrentQty(String(item.currentQty));
    setReorderThreshold(String(item.reorderThreshold));
    setLastPurchasePrice(item.lastPurchasePrice != null ? String(item.lastPurchasePrice) : "");
    setLastOrderedQty(item.lastOrderedQty != null ? String(item.lastOrderedQty) : "");
    setCandidates(normalizeCandidates(item.imageCandidates, item.imageUrl));
    setSelectedImageIndex(item.selectedImageIndex ?? 0);
    setImageGenerationAttempted(item.imageGenerationAttempted ?? false);
  }, [item]);

  const applyIngredientResponse = useCallback((ingredient: IngredientDetail) => {
    const next = normalizeCandidates(ingredient.imageCandidates, ingredient.imageUrl);
    setCandidates(next);
    setSelectedImageIndex(ingredient.selectedImageIndex ?? 0);
    setImageGenerationAttempted(ingredient.imageGenerationAttempted ?? true);
    onSaved?.(ingredient);
  }, [onSaved]);

  const generateImages = useCallback(
    async (mode: "pair" | "secondary") => {
      setGenerating(true);
      setError("");
      try {
        const res = await fetch(
          `/api/catalog/ingredients/${encodeURIComponent(item.slug)}/generate-images`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode, selectedImageIndex }),
          }
        );
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Could not generate images");
          return;
        }
        applyIngredientResponse(data.ingredient as IngredientDetail);
      } catch {
        setError("Could not generate images");
      } finally {
        setGenerating(false);
      }
    },
    [applyIngredientResponse, item.slug, selectedImageIndex]
  );

  const hasDefaultAndSecondary = Boolean(candidates[0]?.url && candidates[1]?.url);

  function handleGenerateClick() {
    void generateImages(hasDefaultAndSecondary ? "secondary" : "pair");
  }

  const low = Number(currentQty) < Number(reorderThreshold);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/catalog/ingredients/${encodeURIComponent(item.slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          brandName,
          sku,
          currentQty: Number(currentQty),
          reorderThreshold: Number(reorderThreshold),
          lastPurchasePrice: lastPurchasePrice ? Number(lastPurchasePrice) : undefined,
          lastOrderedQty: lastOrderedQty ? Number(lastOrderedQty) : undefined,
          selectedImageIndex,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Save failed");
        return;
      }
      onSaved?.(data.ingredient);
      onClose();
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-chef-text/30 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[min(90dvh,100%)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-chef-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
      >
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-chef-text-muted">
              Ingredient
            </p>
            <h2 className="truncate text-xl font-semibold text-chef-text">{item.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-chef-text-muted hover:text-chef-text">
            ✕
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="UID / SKU">
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Slug (internal id)">
            <input
              value={item.slug}
              readOnly
              className="w-full min-w-0 rounded-lg border border-chef-muted bg-chef-muted/40 px-2 py-1.5 text-sm text-chef-text-muted"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Brand">
              <input
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:grid-cols-4">
            <Field label="Available Quantity" compact>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={currentQty}
                  onChange={(e) => setCurrentQty(e.target.value)}
                  className={`${inputClass} ${low ? "text-chef-amber" : ""}`}
                />
                <span className="shrink-0 text-xs text-chef-text-muted">{item.inventoryUnit}</span>
              </div>
            </Field>
            <Field label="Reorder Level" compact>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={reorderThreshold}
                  onChange={(e) => setReorderThreshold(e.target.value)}
                  className={inputClass}
                />
                <span className="shrink-0 text-xs text-chef-text-muted">{item.inventoryUnit}</span>
              </div>
            </Field>
            <Field label="Previous Cost Price" compact>
              <div className="flex items-center gap-1">
                <span className="shrink-0 text-xs text-chef-text-muted">$</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={lastPurchasePrice}
                  onChange={(e) => setLastPurchasePrice(e.target.value)}
                  className={inputClass}
                />
              </div>
            </Field>
            <Field label="Previous Ordered Quantity" compact>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={lastOrderedQty}
                  onChange={(e) => setLastOrderedQty(e.target.value)}
                  className={inputClass}
                />
                <span className="shrink-0 text-xs text-chef-text-muted">{item.inventoryUnit}</span>
              </div>
            </Field>
          </div>
        </div>

        {imageGenerationAttempted && (
          <div className="mt-4">
            <p className="text-sm text-chef-text-muted">
              Tap an image to set default. Generate replaces secondary.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {[0, 1].map((slot) => {
                const img = candidates[slot];
                const isDefault = selectedImageIndex === slot;
                const roleLabel = isDefault ? "Default" : "Secondary";
                return (
                  <div key={slot} className="flex flex-col gap-2">
                    <div
                      className={`relative overflow-hidden rounded-xl border-2 ${
                        img
                          ? isDefault
                            ? "border-chef-sage ring-2 ring-chef-sage/30"
                            : "border-chef-muted"
                          : "border-dashed border-chef-muted bg-chef-muted/30"
                      }`}
                    >
                      {img ? (
                        <button
                          type="button"
                          onClick={() => setSelectedImageIndex(slot)}
                          className="block w-full"
                        >
                          <div className="aspect-[4/3] max-h-36 bg-chef-muted sm:max-h-44">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={img.url}
                              alt={`${name} ${roleLabel.toLowerCase()}`}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        </button>
                      ) : (
                        <div className="flex aspect-[4/3] max-h-36 items-center justify-center text-xs text-chef-text-muted sm:max-h-44">
                          No image
                        </div>
                      )}
                      <span
                        className={`absolute left-2 top-2 rounded px-2 py-0.5 text-xs font-medium ${
                          isDefault
                            ? "bg-chef-sage text-white"
                            : "bg-chef-text/70 text-white"
                        }`}
                      >
                        {roleLabel}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              disabled={generating}
              onClick={handleGenerateClick}
              className="mt-2 rounded-lg border border-chef-sage/50 px-3 py-1.5 text-sm font-medium text-chef-sage hover:bg-chef-sage-light/40 disabled:opacity-50"
            >
              {generating
                ? "Generating…"
                : hasDefaultAndSecondary
                  ? "Regenerate secondary"
                  : "Generate images"}
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        <div className="shrink-0 border-t border-chef-muted/60 bg-chef-surface px-5 py-3 sm:px-6">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-chef-text-muted hover:text-chef-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || generating}
              className="rounded-lg bg-chef-sage px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
