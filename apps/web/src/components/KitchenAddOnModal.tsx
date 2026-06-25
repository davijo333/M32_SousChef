"use client";

import { useEffect, useMemo, useState } from "react";
import type { DishIngredientLink } from "@backend/services/catalog/dish-payload";
import { isUsableImageCandidate } from "@backend/services/catalog/image-selection";
import { validDishImageCount } from "@backend/services/catalog/dish-image-status";

type AddOnModalItem = {
  slug: string;
  name: string;
  classification?: string;
  description?: string;
  sellPrice: number;
  imageUrl?: string;
  imageCandidates?: Array<{ url: string; label?: string; source?: string; score?: number }>;
  selectedImageIndex?: number;
  imageGenerationAttempted?: boolean;
  ingredientLinks?: DishIngredientLink[];
  linkedDishSlugs?: string[];
  isNew?: boolean;
};

type PantryOption = {
  slug: string;
  name: string;
  inventoryUnit: string;
};

type Props = {
  item: AddOnModalItem;
  pantryIngredients: PantryOption[];
  classOptions?: string[];
  onClose: () => void;
  onSaved?: (addOn: {
    slug: string;
    name: string;
    classification: string;
    description?: string;
    sellPrice: number;
    imageUrl?: string;
    imageCandidates?: Array<{ url: string; label?: string; source?: string; score?: number }>;
    selectedImageIndex?: number;
    imageGenerationAttempted?: boolean;
    ingredientLinks: DishIngredientLink[];
    linkedDishSlugs: string[];
  }) => void;
  onDeleted?: (slug: string) => void;
};

const inputClass =
  "w-full min-w-0 rounded-lg border border-chef-muted bg-white px-2 py-1.5 text-sm text-chef-text";

type ImageCandidate = NonNullable<AddOnModalItem["imageCandidates"]>[number];

const CLASS_PRESETS = [{ value: "addon", label: "Add-on" }];

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

function classificationSelectValue(
  classification: string,
  customClass: string,
  knownClasses: Set<string>
): string {
  if (classification === "__custom__") return "__custom__";
  if (knownClasses.has(classification)) return classification;
  return customClass.trim() ? "__custom__" : "addon";
}

export function KitchenAddOnModal({
  item,
  pantryIngredients,
  classOptions = [],
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const isNew = item.isNew ?? !item.slug;
  const [addOnSlug, setAddOnSlug] = useState(item.slug);
  const [name, setName] = useState(item.name ?? "");
  const [classification, setClassification] = useState(item.classification ?? classOptions[0] ?? "addon");
  const [customClass, setCustomClass] = useState(() => {
    const c = item.classification ?? "";
    if (!c) return "";
    if (c.toLowerCase() === "addon") return "";
    if (classOptions.includes(c)) return "";
    return c;
  });
  const [description, setDescription] = useState(item.description ?? "");
  const [sellPrice, setSellPrice] = useState(String(item.sellPrice ?? 0));
  const [ingredientLinks, setIngredientLinks] = useState<DishIngredientLink[]>(item.ingredientLinks ?? []);
  const [candidates, setCandidates] = useState<ImageCandidate[]>(() =>
    normalizeCandidates(item.imageCandidates, item.imageUrl)
  );
  const [selectedImageIndex, setSelectedImageIndex] = useState(item.selectedImageIndex ?? 0);
  const [imageGenerationAttempted, setImageGenerationAttempted] = useState(
    item.imageGenerationAttempted ?? false
  );
  const [ingredientPick, setIngredientPick] = useState("");
  const [newIngredientName, setNewIngredientName] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setAddOnSlug(item.slug);
    setName(item.name ?? "");
    const c = item.classification ?? "";
    setClassification(item.classification ?? classOptions[0] ?? "addon");
    setCustomClass(
      !c || c.toLowerCase() === "addon" || classOptions.includes(c)
        ? ""
        : c
    );
    setDescription(item.description ?? "");
    setSellPrice(String(item.sellPrice ?? 0));
    setIngredientLinks(item.ingredientLinks ?? []);
    setCandidates(normalizeCandidates(item.imageCandidates, item.imageUrl));
    setSelectedImageIndex(item.selectedImageIndex ?? 0);
    setImageGenerationAttempted(item.imageGenerationAttempted ?? false);
  }, [item, classOptions]);

  const availableClassOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const preset of CLASS_PRESETS) options.set(preset.value, preset.label);
    for (const option of classOptions) {
      const value = option.trim();
      if (!value) continue;
      if (!options.has(value)) options.set(value, value);
    }
    return Array.from(options.entries()).map(([value, label]) => ({ value, label }));
  }, [classOptions]);
  const knownClassValues = useMemo(
    () => new Set(availableClassOptions.map((option) => option.value)),
    [availableClassOptions]
  );
  const classSelectValue = classificationSelectValue(classification, customClass, knownClassValues);
  const resolvedClassification =
    classSelectValue === "__custom__" ? customClass.trim() || "addon" : classification;
  const pantryBySlug = useMemo(
    () => new Map(pantryIngredients.map((p) => [p.slug, p])),
    [pantryIngredients]
  );
  const availableIngredients = pantryIngredients.filter(
    (p) => !ingredientLinks.some((l) => l.ingredientSlug === p.slug)
  );
  const photoCount = validDishImageCount(candidates);
  const missingPhotos = photoCount < 2;
  const hasAnyPhoto = photoCount >= 1;
  const hasDefaultAndSecondary = photoCount >= 2;
  const hasImages = hasAnyPhoto;

  function buildSavePayload() {
    return {
      name: name.trim(),
      classification: resolvedClassification.trim() || "addon",
      description,
      sellPrice: Number(sellPrice) || 0,
      selectedImageIndex,
      ingredientLinks,
      linkedDishSlugs: item.linkedDishSlugs ?? [],
    };
  }

  function validateForm(): boolean {
    if (!name.trim()) {
      setError("Add-on name is required");
      return false;
    }
    if (!resolvedClassification.trim()) {
      setError("Class is required");
      return false;
    }
    return true;
  }

  async function persistAddOn(): Promise<AddOnModalItem | null> {
    if (!validateForm()) return null;

    const payload = buildSavePayload();
    const creating = isNew && !addOnSlug;
    const endpoint = creating
      ? "/api/catalog/addons"
      : `/api/catalog/addons/${encodeURIComponent(addOnSlug)}`;

    const res = await fetch(endpoint, {
      method: creating ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await parseResponseBody<{ error?: string; addOn?: AddOnModalItem }>(res);
    if (!res.ok) {
      setError(data?.error ?? "Save failed");
      return null;
    }
    if (!data?.addOn) {
      setError("Save failed");
      return null;
    }

    const saved = {
      ...data.addOn,
      ...payload,
      ingredientLinks,
      linkedDishSlugs: data.addOn.linkedDishSlugs ?? item.linkedDishSlugs ?? [],
    };
    if (!addOnSlug) setAddOnSlug(saved.slug);
    onSaved?.(saved);
    return saved;
  }

  function addIngredientLink(slug: string, unit?: string) {
    if (ingredientLinks.some((l) => l.ingredientSlug === slug)) return;
    setIngredientLinks((prev) => [
      ...prev,
      {
        ingredientSlug: slug,
        qtyPerServing: 1,
        unit: unit ?? pantryBySlug.get(slug)?.inventoryUnit ?? "each",
      },
    ]);
  }

  function updateIngredientLink(slug: string, patch: Partial<DishIngredientLink>) {
    setIngredientLinks((prev) =>
      prev.map((l) => (l.ingredientSlug === slug ? { ...l, ...patch } : l))
    );
  }

  function removeIngredientLink(slug: string) {
    setIngredientLinks((prev) => prev.filter((l) => l.ingredientSlug !== slug));
  }

  async function createIngredientAndLink() {
    const trimmed = newIngredientName.trim();
    if (!trimmed) return;
    setError("");
    try {
      const res = await fetch("/api/catalog/ingredients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, inventoryUnit: "each", currentQty: 0 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create ingredient");
        return;
      }
      addIngredientLink(String(data.slug), "each");
      setNewIngredientName("");
    } catch {
      setError("Could not create ingredient");
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const saved = await persistAddOn();
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
      const saved = await persistAddOn();
      if (!saved?.slug) return;
      await generateImages(saved.slug, "pair", false, false);
    } catch {
      setError("Could not generate images");
    } finally {
      setGenerating(false);
    }
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
      const res = await fetch(`/api/catalog/addons/${encodeURIComponent(slug)}/generate-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          selectedImageIndex: preferred,
          name: name.trim(),
          classification: resolvedClassification.trim() || "addon",
          description,
          ingredientNames: ingredientLinks
            .map((link) => pantryBySlug.get(link.ingredientSlug)?.name)
            .filter((ingredientName): ingredientName is string => Boolean(ingredientName)),
          ingredientLinks,
        }),
      });
      const data = await parseResponseBody<{ error?: string; addOn?: AddOnModalItem }>(res);
      if (!res.ok) {
        setError(data?.error ?? "Could not generate images");
        return;
      }
      if (!data?.addOn) {
        setError("Could not generate images");
        return;
      }
      const updated = data.addOn;
      const next = normalizeCandidates(updated.imageCandidates, updated.imageUrl);
      setCandidates(next);
      setImageGenerationAttempted(updated.imageGenerationAttempted ?? true);
      setSelectedImageIndex(keepSelection ? preferred : updated.selectedImageIndex ?? 0);
      onSaved?.({
        ...updated,
        name: name.trim(),
        classification: resolvedClassification.trim() || "addon",
        description,
        sellPrice: Number(sellPrice) || 0,
        ingredientLinks,
        linkedDishSlugs: updated.linkedDishSlugs ?? item.linkedDishSlugs ?? [],
      });
    } catch {
      setError("Could not generate images");
    } finally {
      if (manageLoading) setGenerating(false);
    }
  }

  async function handlePrimaryAction() {
    if (!missingPhotos) {
      await handleSave();
    } else {
      await handleGenerateImage();
    }
  }

  async function handleDelete() {
    if (!addOnSlug) return;
    const confirmed = window.confirm(
      `Remove add-on "${name || addOnSlug}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/catalog/addons/${encodeURIComponent(addOnSlug)}`, {
        method: "DELETE",
      });
      const data = await parseResponseBody<{ error?: string }>(res);
      if (!res.ok) {
        setError(data?.error ?? "Delete failed");
        return;
      }
      onDeleted?.(addOnSlug);
      onClose();
    } catch {
      setError("Delete failed");
    } finally {
      setDeleting(false);
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
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-chef-text-muted">
                {isNew ? "New add-on" : "Add-on"}
              </p>
              <h2 className="text-xl font-semibold text-chef-text">
                {isNew && !addOnSlug ? "+ Add-on" : name || item.name}
              </h2>
              {isNew && addOnSlug && !hasImages && (
                <p className="mt-1 text-sm text-chef-text-muted">
                  Add-on saved — generate images below.
                </p>
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

          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="text-chef-text-muted">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`mt-1 ${inputClass}`}
                required
                autoFocus
              />
            </label>
            <label className="block text-sm">
              <span className="text-chef-text-muted">Class</span>
              <select
                value={classSelectValue}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "__custom__") {
                    setClassification("__custom__");
                  } else {
                    setClassification(value);
                    setCustomClass("");
                  }
                }}
                className={`mt-1 ${inputClass}`}
                required
              >
                {availableClassOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
                <option value="__custom__">Add new class…</option>
              </select>
            </label>
            {classSelectValue === "__custom__" && (
              <label className="block text-sm">
                <span className="text-chef-text-muted">Custom class</span>
                <input
                  value={customClass}
                  onChange={(e) => setCustomClass(e.target.value)}
                  placeholder="e.g. dips, spreads"
                  className={`mt-1 ${inputClass}`}
                />
              </label>
            )}
            <label className="block text-sm">
              <span className="text-chef-text-muted">Sell price</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="block text-sm">
              <span className="text-chef-text-muted">Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={`mt-1 min-h-24 ${inputClass}`}
                placeholder="Description of the Add-on (For Context and Image)"
              />
            </label>
          </div>

          <div className="mt-5 rounded-xl border border-chef-border p-4">
            <h3 className="text-sm font-semibold text-chef-text">Link ingredients</h3>
            <p className="mt-1 text-xs text-chef-text-muted">
              Select from pantry or add a new ingredient.
            </p>
            {ingredientLinks.length > 0 && (
              <ul className="mt-3 space-y-2">
                {ingredientLinks.map((link) => {
                  const ing = pantryBySlug.get(link.ingredientSlug);
                  return (
                    <li
                      key={link.ingredientSlug}
                      className="flex flex-wrap items-center gap-2 rounded-lg bg-chef-muted/50 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 flex-1 font-medium text-chef-text">
                        {ing?.name ?? link.ingredientSlug}
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={link.qtyPerServing}
                        onChange={(e) =>
                          updateIngredientLink(link.ingredientSlug, {
                            qtyPerServing: Number(e.target.value) || 0,
                          })
                        }
                        className="w-16 rounded border border-chef-muted bg-white px-2 py-1 text-sm"
                        aria-label="Quantity per serving"
                      />
                      <input
                        value={link.unit}
                        onChange={(e) =>
                          updateIngredientLink(link.ingredientSlug, { unit: e.target.value })
                        }
                        className="w-20 rounded border border-chef-muted bg-white px-2 py-1 text-sm"
                        aria-label="Unit"
                      />
                      <button
                        type="button"
                        onClick={() => removeIngredientLink(link.ingredientSlug)}
                        className="text-chef-text-muted hover:text-red-600"
                        aria-label="Remove ingredient"
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <select
                value={ingredientPick}
                onChange={(e) => {
                  const slug = e.target.value;
                  setIngredientPick("");
                  if (slug) addIngredientLink(slug);
                }}
                className="min-w-0 flex-1 rounded-lg border border-chef-muted bg-white px-2 py-1.5 text-sm"
              >
                <option value="">Select ingredient…</option>
                {availableIngredients.map((ing) => (
                  <option key={ing.slug} value={ing.slug}>
                    {ing.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={newIngredientName}
                onChange={(e) => setNewIngredientName(e.target.value)}
                placeholder="New ingredient name"
                className={`${inputClass} flex-1`}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createIngredientAndLink();
                  }
                }}
              />
              <button
                type="button"
                onClick={() => void createIngredientAndLink()}
                disabled={!newIngredientName.trim()}
                className="shrink-0 rounded-lg border border-chef-sage/50 px-3 py-1.5 text-sm font-medium text-chef-sage hover:bg-chef-sage-light/40 disabled:opacity-50"
              >
                Add new
              </button>
            </div>
          </div>

          {addOnSlug && hasImages && (
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
                    onClick={() => void generateImages(addOnSlug, "secondary", true)}
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
                    onClick={() => addOnSlug && void generateImages(addOnSlug, "pair", true)}
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
              {addOnSlug && (
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
