"use client";

import { useEffect, useState } from "react";
import { INGREDIENT_CATEGORY_OPTIONS } from "@backend/services/catalog/catalog-classification";
import { isUsableImageCandidate } from "@backend/services/catalog/image-selection";
import { validIngredientImageCount } from "@backend/services/catalog/ingredient-image-status";

export type IngredientDetail = {
  slug: string;
  sku?: string;
  name: string;
  category?: string;
  imageUrl?: string;
  imageCandidates?: Array<{ url: string; label?: string; source?: string; score?: number }>;
  selectedImageIndex?: number;
  imageGenerationAttempted?: boolean;
  brandName?: string;
  label?: "new" | "used" | "unused" | "missing";
  lastPurchasePrice?: number;
  lastPurchaseDate?: string | null;
  lastOrderedQty?: number;
  currentQty: number;
  inventoryUnit: string;
  reorderThreshold: number;
  isNew?: boolean;
};

type Props = {
  item: IngredientDetail;
  onClose: () => void;
  onSaved?: (updated: IngredientDetail) => void;
  onDeleted?: (slug: string) => void;
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
  const fromDb = (imageCandidates ?? []).filter((c) => isUsableImageCandidate(c));
  if (fromDb.length) return fromDb.slice(0, 2);
  if (imageUrl && isUsableImageCandidate({ url: imageUrl })) return [{ url: imageUrl }];
  return [];
}

async function parseResponseBody<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function KitchenIngredientModal({ item, onClose, onSaved, onDeleted }: Props) {
  const isNew = item.isNew ?? !item.slug;
  const [ingredientSlug, setIngredientSlug] = useState(item.slug);
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category ?? "misc");
  const [brandName, setBrandName] = useState(item.brandName ?? "");
  const [sku, setSku] = useState(item.sku ?? item.slug);
  const [inventoryUnit, setInventoryUnit] = useState(item.inventoryUnit || "each");
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
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setIngredientSlug(item.slug);
    setName(item.name);
    setCategory(item.category ?? "misc");
    setBrandName(item.brandName ?? "");
    setSku(item.sku ?? item.slug);
    setInventoryUnit(item.inventoryUnit || "each");
    setCurrentQty(String(item.currentQty));
    setReorderThreshold(String(item.reorderThreshold));
    setLastPurchasePrice(item.lastPurchasePrice != null ? String(item.lastPurchasePrice) : "");
    setLastOrderedQty(item.lastOrderedQty != null ? String(item.lastOrderedQty) : "");
    setCandidates(normalizeCandidates(item.imageCandidates, item.imageUrl));
    setSelectedImageIndex(item.selectedImageIndex ?? 0);
  }, [item]);

  const photoCount = validIngredientImageCount(candidates);
  const missingPhotos = photoCount < 2;
  const hasAnyPhoto = photoCount >= 1;
  const hasDefaultAndSecondary = photoCount >= 2;
  const hasImages = hasAnyPhoto;
  const low = Number(currentQty) < Number(reorderThreshold);

  function buildSavePayload() {
    return {
      name: name.trim(),
      brandName: brandName.trim() || undefined,
      category,
      sku: sku.trim() || undefined,
      inventoryUnit,
      currentQty: Number(currentQty) || 0,
      reorderThreshold: Number(reorderThreshold) || 0,
      lastPurchasePrice: lastPurchasePrice ? Number(lastPurchasePrice) : undefined,
      lastOrderedQty: lastOrderedQty ? Number(lastOrderedQty) : undefined,
      selectedImageIndex,
    };
  }

  function validateForm(): boolean {
    if (!name.trim()) {
      setError("Ingredient name is required");
      return false;
    }
    return true;
  }

  function toIngredientDetail(
    data: Partial<IngredientDetail> & { slug: string },
    payload = buildSavePayload()
  ): IngredientDetail {
    return {
      slug: data.slug,
      sku: data.sku ?? payload.sku ?? data.slug,
      name: payload.name,
      category: data.category ?? payload.category,
      brandName: payload.brandName,
      currentQty: payload.currentQty,
      inventoryUnit: data.inventoryUnit ?? payload.inventoryUnit,
      reorderThreshold: payload.reorderThreshold,
      lastPurchasePrice: payload.lastPurchasePrice,
      lastOrderedQty: payload.lastOrderedQty,
      imageUrl: data.imageUrl,
      imageCandidates: data.imageCandidates ?? candidates,
      selectedImageIndex: data.selectedImageIndex ?? selectedImageIndex,
      imageGenerationAttempted: data.imageGenerationAttempted ?? true,
      label: item.label,
    };
  }

  async function persistIngredient(): Promise<IngredientDetail | null> {
    if (!validateForm()) return null;

    const payload = buildSavePayload();
    const creating = isNew && !ingredientSlug;
    const endpoint = creating
      ? "/api/catalog/ingredients"
      : `/api/catalog/ingredients/${encodeURIComponent(ingredientSlug)}`;

    const res = await fetch(endpoint, {
      method: creating ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        creating
          ? {
              name: payload.name,
              brandName: payload.brandName,
              category: payload.category,
              inventoryUnit: payload.inventoryUnit,
              currentQty: payload.currentQty,
              reorderThreshold: payload.reorderThreshold,
              unitPrice: payload.lastPurchasePrice,
              sku: payload.sku,
            }
          : payload
      ),
    });

    const data = await parseResponseBody<{
      error?: string;
      slug?: string;
      sku?: string;
      name?: string;
      imageUrl?: string;
      ingredient?: IngredientDetail;
    }>(res);

    if (!res.ok) {
      setError(data?.error ?? "Save failed");
      return null;
    }

    const saved = data?.ingredient
      ? toIngredientDetail(data.ingredient, payload)
      : toIngredientDetail(
          {
            slug: data?.slug ?? ingredientSlug,
            sku: data?.sku,
            name: data?.name,
            imageUrl: data?.imageUrl,
            category: payload.category,
            inventoryUnit: payload.inventoryUnit,
          },
          payload
        );

    if (!ingredientSlug) setIngredientSlug(saved.slug);
    if (saved.sku) setSku(saved.sku);
    onSaved?.(saved);
    return saved;
  }

  async function generateImages(
    slug: string,
    mode: "pair" | "secondary",
    keepSelection = false,
    manageLoading = true
  ) {
    if (manageLoading) setGenerating(true);
    setError("");
    const preferred = selectedImageIndex;
    try {
      const res = await fetch(
        `/api/catalog/ingredients/${encodeURIComponent(slug)}/generate-images`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            selectedImageIndex: preferred,
          }),
        }
      );
      const data = await parseResponseBody<{ error?: string; ingredient?: IngredientDetail }>(res);
      if (!res.ok) {
        setError(data?.error ?? "Could not generate images");
        return;
      }
      if (!data?.ingredient) {
        setError("Could not generate images");
        return;
      }

      const updated = toIngredientDetail(data.ingredient);
      const next = normalizeCandidates(updated.imageCandidates, updated.imageUrl);
      setCandidates(next);
      setSelectedImageIndex(keepSelection ? preferred : updated.selectedImageIndex ?? 0);
      onSaved?.(updated);
    } catch {
      setError("Could not generate images");
    } finally {
      if (manageLoading) setGenerating(false);
    }
  }

  async function handleDelete() {
    if (!ingredientSlug) return;
    const confirmed = window.confirm(
      `Remove ingredient "${name || ingredientSlug}" from pantry? This unlinks it from dishes and cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/catalog/ingredients/${encodeURIComponent(ingredientSlug)}`, {
        method: "DELETE",
      });
      const data = await parseResponseBody<{ error?: string }>(res);
      if (!res.ok) {
        setError(data?.error ?? "Remove failed");
        return;
      }
      onDeleted?.(ingredientSlug);
      onClose();
    } catch {
      setError("Remove failed");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const saved = await persistIngredient();
      if (saved) onClose();
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateImage() {
    setGenerating(true);
    setError("");
    try {
      const saved = await persistIngredient();
      if (!saved?.slug) return;
      await generateImages(saved.slug, "pair", false, false);
    } catch {
      setError("Could not generate images");
    } finally {
      setGenerating(false);
    }
  }

  async function handlePrimaryAction() {
    if (!missingPhotos) {
      await handleSave();
    } else {
      await handleGenerateImage();
    }
  }

  function handleImageSelect(slot: number) {
    if (!candidates[slot]?.url) return;
    if (hasDefaultAndSecondary) {
      setSelectedImageIndex((prev) => 1 - prev);
      return;
    }
    setSelectedImageIndex(slot);
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
                {isNew ? "New ingredient" : "Ingredient"}
              </p>
              <h2 className="truncate text-xl font-semibold text-chef-text">
                {isNew && !ingredientSlug ? "+ Ingredient" : name || item.name}
              </h2>
              {isNew && ingredientSlug && !hasImages && (
                <p className="mt-1 text-sm text-chef-text-muted">
                  Ingredient saved — generate images below.
                </p>
              )}
              {item.label && (
                <p className="mt-1 text-xs font-semibold uppercase text-chef-sage">{item.label}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 text-chef-text-muted hover:text-chef-text"
            >
              ✕
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {ingredientSlug && (
              <Field label="UID / SKU">
                <input value={sku} onChange={(e) => setSku(e.target.value)} className={inputClass} />
              </Field>
            )}
            {ingredientSlug && (
              <Field label="Slug (internal id)">
                <input
                  value={ingredientSlug}
                  readOnly
                  className="w-full min-w-0 rounded-lg border border-chef-muted bg-chef-muted/40 px-2 py-1.5 text-sm text-chef-text-muted"
                />
              </Field>
            )}
            <div className="sm:col-span-2">
              <Field label="Name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  required
                  autoFocus
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Category">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={inputClass}
                >
                  {INGREDIENT_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
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
                  <span className="shrink-0 text-xs text-chef-text-muted">{inventoryUnit}</span>
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
                  <span className="shrink-0 text-xs text-chef-text-muted">{inventoryUnit}</span>
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
                  <span className="shrink-0 text-xs text-chef-text-muted">{inventoryUnit}</span>
                </div>
              </Field>
            </div>
          </div>

          {ingredientSlug && hasImages && (
            <div className="mt-4">
              <p className="text-sm text-chef-text-muted">
                Tap an image to toggle default and secondary.
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
                            onClick={() => handleImageSelect(slot)}
                            className="block w-full"
                            aria-pressed={isDefault}
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
                            isDefault ? "bg-chef-sage text-white" : "bg-chef-text/70 text-white"
                          }`}
                        >
                          {roleLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {hasDefaultAndSecondary && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={generating || saving}
                    onClick={() => void generateImages(ingredientSlug, "secondary", true)}
                    className="rounded-lg border border-chef-sage/50 px-3 py-1.5 text-sm font-medium text-chef-sage hover:bg-chef-sage-light/40 disabled:opacity-50"
                  >
                    {generating ? "Generating…" : "Regenerate secondary"}
                  </button>
                </div>
              )}
              {missingPhotos && hasAnyPhoto && !hasDefaultAndSecondary && (
                <div className="mt-2">
                  <button
                    type="button"
                    disabled={generating || saving}
                    onClick={() =>
                      ingredientSlug && void generateImages(ingredientSlug, "pair", true)
                    }
                    className="rounded-lg border border-chef-sage/50 px-3 py-1.5 text-sm font-medium text-chef-sage hover:bg-chef-sage-light/40 disabled:opacity-50"
                  >
                    {generating ? "Generating…" : "Generate secondary photo"}
                  </button>
                </div>
              )}
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        <div className="shrink-0 border-t border-chef-muted/60 bg-chef-surface px-5 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            <div>
              {ingredientSlug && !isNew && (
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={saving || generating || deleting}
                  className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  {deleting ? "Removing…" : "Remove"}
                </button>
              )}
            </div>
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
              onClick={() => void handlePrimaryAction()}
              disabled={saving || generating || deleting}
              className="rounded-lg bg-chef-sage px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {generating
                ? "Generating…"
                : saving
                  ? "Saving…"
                  : missingPhotos
                    ? hasAnyPhoto
                      ? "Complete photos"
                      : "Generate images"
                    : "Save"}
            </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
