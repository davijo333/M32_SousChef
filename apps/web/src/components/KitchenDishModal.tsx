"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DishDetail, DishIngredientLink } from "@/lib/dish-payload";
import { isUsableImageCandidate } from "@/lib/image-selection";

type PantryOption = {
  slug: string;
  name: string;
  inventoryUnit: string;
};

type AddOnOption = {
  slug: string;
  name: string;
  sellPrice: number;
};

type Props = {
  item: DishDetail;
  pantryIngredients: PantryOption[];
  existingAddOns: AddOnOption[];
  classOptions?: string[];
  onClose: () => void;
  onSaved?: (updated: DishDetail) => void;
  onDeleted?: (slug: string) => void;
};

async function parseResponseBody<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

type ImageCandidate = NonNullable<DishDetail["imageCandidates"]>[number];

const CLASS_PRESETS = [
  { value: "sandwich", label: "Sandwich" },
  { value: "beverage", label: "Beverage" },
];

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

function classificationSelectValue(classification: string, customClass: string): string {
  if (CLASS_PRESETS.some((p) => p.value === classification)) return classification;
  return customClass.trim() ? "__custom__" : classification || "sandwich";
}

export function KitchenDishModal({
  item,
  pantryIngredients,
  existingAddOns,
  classOptions = [],
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const isNew = item.isNew ?? !item.slug;
  const [dishSlug, setDishSlug] = useState(item.slug);
  const [name, setName] = useState(item.name);
  const [classification, setClassification] = useState(
    item.classification ?? item.category ?? "sandwich"
  );
  const [customClass, setCustomClass] = useState(() => {
    const c = item.classification ?? item.category ?? "";
    return CLASS_PRESETS.some((p) => p.value === c) ? "" : c;
  });
  const [sellPrice, setSellPrice] = useState(String(item.sellPrice));
  const [description, setDescription] = useState(item.description ?? "");
  const [ingredientLinks, setIngredientLinks] = useState<DishIngredientLink[]>(
    item.ingredientLinks ?? []
  );
  const [linkedAddOnSlugs, setLinkedAddOnSlugs] = useState<string[]>(
    item.linkedAddOnSlugs ?? []
  );
  const [addOnOptions, setAddOnOptions] = useState<AddOnOption[]>(existingAddOns);
  const [pantryOptions, setPantryOptions] = useState<PantryOption[]>(pantryIngredients);
  const [ingredientPick, setIngredientPick] = useState("");
  const [addOnPick, setAddOnPick] = useState("");
  const [newIngredientName, setNewIngredientName] = useState("");
  const [newAddOnName, setNewAddOnName] = useState("");
  const [candidates, setCandidates] = useState<ImageCandidate[]>(() =>
    normalizeCandidates(item.imageCandidates, item.imageUrl)
  );
  const [selectedImageIndex, setSelectedImageIndex] = useState(item.selectedImageIndex ?? 0);
  const [imageGenerationAttempted, setImageGenerationAttempted] = useState(
    item.imageGenerationAttempted ?? false
  );
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setAddOnOptions(existingAddOns);
  }, [existingAddOns]);

  useEffect(() => {
    setPantryOptions(pantryIngredients);
  }, [pantryIngredients]);

  useEffect(() => {
    setDishSlug(item.slug);
    setName(item.name);
    setClassification(item.classification ?? item.category ?? "sandwich");
    const c = item.classification ?? item.category ?? "";
    setCustomClass(CLASS_PRESETS.some((p) => p.value === c) ? "" : c);
    setSellPrice(String(item.sellPrice));
    setDescription(item.description ?? "");
    setIngredientLinks(item.ingredientLinks ?? []);
    setLinkedAddOnSlugs(item.linkedAddOnSlugs ?? []);
    setCandidates(normalizeCandidates(item.imageCandidates, item.imageUrl));
    setSelectedImageIndex(item.selectedImageIndex ?? 0);
    setImageGenerationAttempted(item.imageGenerationAttempted ?? false);
  }, [item]);

  const resolvedClassification = useMemo(() => {
    if (classificationSelectValue(classification, customClass) === "__custom__") {
      return customClass.trim() || "other";
    }
    return classification;
  }, [classification, customClass]);

  const pantryBySlug = useMemo(
    () => new Map(pantryOptions.map((p) => [p.slug, p])),
    [pantryOptions]
  );

  const addOnBySlug = useMemo(
    () => new Map(addOnOptions.map((a) => [a.slug, a])),
    [addOnOptions]
  );

  const availableIngredients = pantryOptions.filter(
    (p) => !ingredientLinks.some((l) => l.ingredientSlug === p.slug)
  );

  const availableAddOns = addOnOptions.filter((a) => !linkedAddOnSlugs.includes(a.slug));

  const applyDishResponse = useCallback(
    (dish: DishDetail, notifyParent = true) => {
      const next = normalizeCandidates(dish.imageCandidates, dish.imageUrl);
      setCandidates(next);
      setSelectedImageIndex(dish.selectedImageIndex ?? 0);
      setImageGenerationAttempted(dish.imageGenerationAttempted ?? true);
      if (notifyParent) {
        onSaved?.({
          ...dish,
          name: name.trim(),
          description: description.trim() || undefined,
          classification: resolvedClassification,
          category: resolvedClassification,
          ingredientLinks,
          linkedAddOnSlugs,
        });
      }
    },
    [
      onSaved,
      name,
      description,
      resolvedClassification,
      ingredientLinks,
      linkedAddOnSlugs,
    ]
  );

  const imageGenContext = useMemo(
    () => ({
      name: name.trim(),
      description: description.trim(),
      classification: resolvedClassification,
      ingredientNames: ingredientLinks
        .map((link) => pantryBySlug.get(link.ingredientSlug)?.name)
        .filter((ingredientName): ingredientName is string => Boolean(ingredientName)),
      ingredientLinks,
    }),
    [description, ingredientLinks, name, pantryBySlug, resolvedClassification]
  );

  const hasDefaultAndSecondary = Boolean(candidates[0]?.url && candidates[1]?.url);
  const hasImages = candidates.some((c) => Boolean(c?.url));

  function buildSavePayload() {
    return {
      name: name.trim(),
      classification: resolvedClassification,
      sellPrice: Number(sellPrice) || 0,
      description: description.trim(),
      ingredientLinks,
      linkedAddOnSlugs,
      ...(dishSlug ? { selectedImageIndex } : {}),
    };
  }

  async function persistDish(): Promise<DishDetail | null> {
    if (!name.trim()) {
      setError("Dish name is required");
      return null;
    }

    const payload = buildSavePayload();
    const creating = isNew && !dishSlug;
    const endpoint = creating
      ? "/api/catalog/dishes"
      : `/api/catalog/dishes/${encodeURIComponent(dishSlug)}`;

    const res = await fetch(endpoint, {
      method: creating ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await parseResponseBody<{ error?: string; dish?: DishDetail }>(res);
    if (!res.ok) {
      setError(data?.error ?? "Save failed");
      return null;
    }
    if (!data?.dish) {
      setError("Save failed");
      return null;
    }

    const saved = {
      ...data.dish,
      ...payload,
      category: resolvedClassification,
      classification: resolvedClassification,
      description: payload.description || undefined,
      ingredientLinks,
      linkedAddOnSlugs,
    };
    if (!dishSlug) setDishSlug(saved.slug);
    onSaved?.(saved);
    return saved;
  }

  const generateImages = useCallback(
    async (
      slug: string,
      mode: "pair" | "secondary",
      opts?: { keepSelection?: boolean; manageLoading?: boolean }
    ) => {
      const manageLoading = opts?.manageLoading ?? true;
      if (manageLoading) setGenerating(true);
      setError("");
      const preferred = selectedImageIndex;
      try {
        const res = await fetch(
          `/api/catalog/dishes/${encodeURIComponent(slug)}/generate-images`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode,
              selectedImageIndex: preferred,
              ...imageGenContext,
            }),
          }
        );
        const data = await parseResponseBody<{ error?: string; dish?: DishDetail }>(res);
        if (!res.ok) {
          setError(data?.error ?? "Could not generate images");
          return;
        }
        if (!data?.dish) {
          setError("Could not generate images");
          return;
        }
        const dish = data.dish;
        if (opts?.keepSelection) {
          dish.selectedImageIndex = preferred;
        }
        applyDishResponse(dish);
      } catch {
        setError("Could not generate images");
      } finally {
        if (manageLoading) setGenerating(false);
      }
    },
    [applyDishResponse, imageGenContext, selectedImageIndex]
  );

  function handleImageSelect(slot: number) {
    if (!candidates[slot]?.url) return;
    if (hasDefaultAndSecondary) {
      setSelectedImageIndex((prev) => 1 - prev);
      return;
    }
    setSelectedImageIndex(slot);
  }

  function handleRegenerateSecondary() {
    if (!dishSlug) return;
    void generateImages(dishSlug, "secondary", { keepSelection: true });
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

  function removeIngredientLink(slug: string) {
    setIngredientLinks((prev) => prev.filter((l) => l.ingredientSlug !== slug));
  }

  function updateIngredientLink(slug: string, patch: Partial<DishIngredientLink>) {
    setIngredientLinks((prev) =>
      prev.map((l) => (l.ingredientSlug === slug ? { ...l, ...patch } : l))
    );
  }

  function addLinkedAddOn(slug: string) {
    if (linkedAddOnSlugs.includes(slug)) return;
    setLinkedAddOnSlugs((prev) => [...prev, slug]);
  }

  function removeLinkedAddOn(slug: string) {
    setLinkedAddOnSlugs((prev) => prev.filter((s) => s !== slug));
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
      const option = {
        slug: data.slug as string,
        name: data.name as string,
        inventoryUnit: "each",
      };
      setPantryOptions((prev) => [...prev, option].sort((a, b) => a.name.localeCompare(b.name)));
      addIngredientLink(option.slug, option.inventoryUnit);
      setNewIngredientName("");
    } catch {
      setError("Could not create ingredient");
    }
  }

  async function createAddOnAndLink() {
    const trimmed = newAddOnName.trim();
    if (!trimmed) return;
    setError("");
    try {
      const res = await fetch("/api/catalog/addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          sellPrice: 0,
          linkedDishSlugs: isNew && !dishSlug ? [] : [dishSlug],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create add-on");
        return;
      }
      const option = data.addOn as AddOnOption;
      setAddOnOptions((prev) => [...prev, option].sort((a, b) => a.name.localeCompare(b.name)));
      addLinkedAddOn(option.slug);
      setNewAddOnName("");
    } catch {
      setError("Could not create add-on");
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const saved = await persistDish();
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
      const saved = await persistDish();
      if (!saved?.slug) return;
      await generateImages(saved.slug, "pair", { manageLoading: false });
    } catch {
      setError("Could not generate images");
    } finally {
      setGenerating(false);
    }
  }

  async function handlePrimaryAction() {
    if (hasImages) {
      await handleSave();
    } else {
      await handleGenerateImage();
    }
  }

  async function handleDelete() {
    if (!dishSlug) return;
    const confirmed = window.confirm(`Remove dish "${name || dishSlug}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/catalog/dishes/${encodeURIComponent(dishSlug)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Delete failed");
        return;
      }
      onDeleted?.(dishSlug);
      onClose();
    } catch {
      setError("Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const recipeLabel =
    item.recipeStatus === "active"
      ? "Active"
      : item.recipeStatus === "new"
        ? "New"
        : item.recipeStatus ?? "—";

  const classSelectValue = classificationSelectValue(classification, customClass);
  const availableClassOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const preset of CLASS_PRESETS) {
      options.set(preset.value, preset.label);
    }
    for (const option of classOptions) {
      const value = option.trim();
      if (!value) continue;
      if (!options.has(value)) options.set(value, value);
    }
    return Array.from(options.entries()).map(([value, label]) => ({ value, label }));
  }, [classOptions]);

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
                {isNew ? "New dish" : "Dish"}
              </p>
              <h2 className="truncate text-xl font-semibold text-chef-text">
                {isNew && !dishSlug ? "+ Dish" : name || item.name}
              </h2>
              {isNew && dishSlug && !hasImages && (
                <p className="mt-1 text-sm text-chef-text-muted">
                  Dish saved — generate images below.
                </p>
              )}
              {!isNew && dishSlug && (
                <p className="mt-1 text-xs font-semibold uppercase text-chef-sage">
                  Recipe: {recipeLabel} · {item.totalSold} sold
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

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {dishSlug && (
              <Field label="Slug (internal id)">
                <input
                  value={dishSlug}
                  readOnly
                  className="w-full min-w-0 rounded-lg border border-chef-muted bg-chef-muted/40 px-2 py-1.5 text-sm text-chef-text-muted"
                />
              </Field>
            )}
            <div className={isNew ? "sm:col-span-2" : ""}>
              <Field label="Class">
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
                  className={inputClass}
                >
                  {availableClassOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                  <option value="__custom__">Add new class…</option>
                </select>
              </Field>
            </div>
            {classSelectValue === "__custom__" && (
              <div className="sm:col-span-2">
                <Field label="Custom class">
                  <input
                    value={customClass}
                    onChange={(e) => setCustomClass(e.target.value)}
                    placeholder="e.g. salad, pastry"
                    className={inputClass}
                  />
                </Field>
              </div>
            )}
            <div className="sm:col-span-2">
              <Field label="Dish name">
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              </Field>
            </div>
            <Field label="Sell price" compact>
              <div className="flex items-center gap-1">
                <span className="shrink-0 text-xs text-chef-text-muted">$</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                  className={inputClass}
                />
              </div>
            </Field>
            {dishSlug && (
              <Field label="Total sold" compact>
                <input
                  value={String(item.totalSold)}
                  readOnly
                  className="w-full min-w-0 rounded-lg border border-chef-muted bg-chef-muted/40 px-2 py-1.5 text-sm text-chef-text-muted"
                />
              </Field>
            )}
            <div className="sm:col-span-2">
              <Field label="Description">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className={inputClass}
                />
              </Field>
            </div>
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

          <div className="mt-4 rounded-xl border border-chef-border p-4">
            <h3 className="text-sm font-semibold text-chef-text">Link add-ons</h3>
            <p className="mt-1 text-xs text-chef-text-muted">
              Select existing add-ons or create a new one for this dish.
            </p>
            {linkedAddOnSlugs.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {linkedAddOnSlugs.map((slug) => {
                  const addOn = addOnBySlug.get(slug);
                  return (
                    <li
                      key={slug}
                      className="flex items-center gap-2 rounded-full bg-chef-sage-light/60 px-3 py-1 text-sm text-chef-text"
                    >
                      <span>{addOn?.name ?? slug}</span>
                      <button
                        type="button"
                        onClick={() => removeLinkedAddOn(slug)}
                        className="text-chef-text-muted hover:text-red-600"
                        aria-label="Remove add-on"
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-3">
              <select
                value={addOnPick}
                onChange={(e) => {
                  const slug = e.target.value;
                  setAddOnPick("");
                  if (slug) addLinkedAddOn(slug);
                }}
                className="w-full rounded-lg border border-chef-muted bg-white px-2 py-1.5 text-sm"
              >
                <option value="">Select add-on…</option>
                {availableAddOns.map((addOn) => (
                  <option key={addOn.slug} value={addOn.slug}>
                    {addOn.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={newAddOnName}
                onChange={(e) => setNewAddOnName(e.target.value)}
                placeholder="New add-on name"
                className={`${inputClass} flex-1`}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createAddOnAndLink();
                  }
                }}
              />
              <button
                type="button"
                onClick={() => void createAddOnAndLink()}
                disabled={!newAddOnName.trim()}
                className="shrink-0 rounded-lg border border-chef-sage/50 px-3 py-1.5 text-sm font-medium text-chef-sage hover:bg-chef-sage-light/40 disabled:opacity-50"
              >
                Add new
              </button>
            </div>
          </div>

          {dishSlug && hasImages && (
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
                    onClick={handleRegenerateSecondary}
                    className="rounded-lg border border-chef-sage/50 px-3 py-1.5 text-sm font-medium text-chef-sage hover:bg-chef-sage-light/40 disabled:opacity-50"
                  >
                    {generating ? "Generating…" : "Regenerate secondary"}
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
              {dishSlug && (
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
                  : hasImages
                    ? "Save"
                    : "Generate Image"}
            </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
