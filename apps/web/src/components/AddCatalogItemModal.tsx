"use client";

import { useEffect, useState } from "react";
import type { ImageSuggestion, NewCatalogItem } from "@backend/services/catalog/extract-new-items";
import { relinkBillsForItems } from "@backend/services/catalog/catalog-add";
import {
  bestSuggestedImageUrl,
  initialModalImageUrl,
  sortImagesByScore,
} from "@backend/services/catalog/image-selection";

type Props = {
  item: NewCatalogItem;
  itemType: "ingredient" | "dish";
  onClose: () => void;
  onAdded: (itemId: string) => void;
  onImageSelectionChange?: (url: string, manual: boolean) => void;
};

const INGREDIENT_CATEGORIES = [
  { value: "bakery", label: "Bakery" },
  { value: "dairy", label: "Dairy" },
  { value: "produce", label: "Produce" },
  { value: "protein", label: "Protein" },
  { value: "pantry", label: "Pantry" },
  { value: "beverage", label: "Beverages" },
  { value: "misc", label: "Other" },
];

const DISH_CATEGORIES = [
  { value: "coffee_drinks", label: "Coffee drinks" },
  { value: "tea_drinks", label: "Tea drinks" },
  { value: "juice_drinks", label: "Juice drinks" },
  { value: "breakfast_sandwiches", label: "Breakfast sandwiches" },
  { value: "other", label: "Other" },
];

function formatCategory(value: string, itemType: "ingredient" | "dish") {
  const list = itemType === "ingredient" ? INGREDIENT_CATEGORIES : DISH_CATEGORIES;
  return list.find((c) => c.value === value)?.label ?? value.replace(/_/g, " ");
}

function CatalogImage({ src, alt, selected, onSelect, styled, topPick }: {
  src: string;
  alt: string;
  selected: boolean;
  onSelect: () => void;
  styled?: boolean;
  topPick?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative aspect-[4/3] w-full overflow-hidden rounded-xl border-2 bg-chef-muted transition ${
        selected
          ? "border-chef-sage ring-2 ring-chef-sage/25"
          : "border-chef-border hover:border-chef-sage/50"
      }`}
      title={selected ? "Selected" : "Tap to select this photo"}
      aria-pressed={selected}
    >
      {topPick && !selected && (
        <span className="absolute left-2 top-2 z-10 rounded bg-chef-sage px-2 py-0.5 text-xs font-medium text-white">
          Best match
        </span>
      )}
      {failed || !src ? (
        <div className="flex h-full w-full items-center justify-center bg-chef-muted text-sm text-chef-text-muted">
          No preview
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          loading="lazy"
          className={
            styled
              ? "h-full w-full object-cover object-center saturate-[0.92] contrast-[1.05]"
              : "h-full w-full object-cover object-center"
          }
          onError={() => setFailed(true)}
        />
      )}
    </button>
  );
}

export function AddCatalogItemModal({
  item,
  itemType,
  onClose,
  onAdded,
  onImageSelectionChange,
}: Props) {
  const [name, setName] = useState(item.name);
  const [brandName, setBrandName] = useState(item.brandName ?? "");
  const [category, setCategory] = useState(itemType === "ingredient" ? "misc" : "other");
  const [inventoryUnit, setInventoryUnit] = useState(item.unit || "each");
  const [reorderThreshold, setReorderThreshold] = useState("1");
  const [sellPrice, setSellPrice] = useState(String(item.unitPrice || 0));
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<ImageSuggestion[]>(item.imageSuggestions ?? []);
  const [selectedImage, setSelectedImage] = useState(
    initialModalImageUrl(item, item.imageSuggestions ?? [])
  );
  const [manualPick, setManualPick] = useState(item.imageSelectionManual ?? false);
  const [loadingImages, setLoadingImages] = useState(
    item.imagesLoading || item.imageSuggestions.length === 0
  );
  const [imageKeywords, setImageKeywords] = useState("");
  const [imageError, setImageError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function applyImageSelection(url: string, manual: boolean) {
    setSelectedImage(url);
    setManualPick(manual);
    onImageSelectionChange?.(url, manual);
  }

  function applySuggestedPick(imageList: ImageSuggestion[]) {
    const url = bestSuggestedImageUrl(imageList);
    if (url) applyImageSelection(url, false);
  }

  function selectImageManually(url: string) {
    applyImageSelection(url, true);
  }

  async function fetchImages(opts: {
    searchName: string;
    searchBrand: string;
    keywords: string;
    preferPreloaded?: boolean;
  }) {
    if (opts.preferPreloaded) {
      const preloaded = (item.imageSuggestions ?? []).filter(
        (img) => img.url && !img.url.includes("placehold.co")
      );
      if (preloaded.length > 0) {
        const sorted = sortImagesByScore(preloaded);
        setImages(sorted);
        if (item.imageSelectionManual && item.selectedImageUrl) {
          setSelectedImage(item.selectedImageUrl);
        } else if (item.selectedImageUrl) {
          setSelectedImage(item.selectedImageUrl);
        } else {
          applySuggestedPick(sorted);
        }
        setLoadingImages(false);
        return;
      }
    }

    setLoadingImages(true);
    setImageError("");
    try {
      const res = await fetch("/api/catalog/suggest-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: opts.searchName,
          itemType,
          brandName: opts.searchBrand,
          quantity: item.quantity,
          unit: item.unit,
          extraKeywords: opts.keywords.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImageError(data.error ?? "Could not find photos. Try different keywords.");
        return;
      }
      const real = sortImagesByScore(
        (data.images ?? []).filter(
          (img: ImageSuggestion) => img.url && !img.url.includes("placehold.co")
        )
      );
      setImages(real);
      if (manualPick && selectedImage) {
        // Keep owner's pick after a new search
      } else {
        applySuggestedPick(real);
      }
    } catch {
      setImageError("Could not find photos. Check your connection and try again.");
    } finally {
      setLoadingImages(false);
    }
  }

  useEffect(() => {
    fetchImages({
      searchName: item.name,
      searchBrand: item.brandName ?? "",
      keywords: "",
      preferPreloaded: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, itemType]);

  function refreshImages() {
    fetchImages({
      searchName: name,
      searchBrand: brandName,
      keywords: imageKeywords,
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const endpoint =
      itemType === "ingredient" ? "/api/catalog/ingredients" : "/api/catalog/menu-items";

    const payload =
      itemType === "ingredient"
        ? {
            name,
            brandName: brandName || undefined,
            category,
            inventoryUnit,
            unit: item.unit,
            currentQty: 0,
            reorderThreshold: Number(reorderThreshold),
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            imageUrl: selectedImage || undefined,
          }
        : {
            name,
            category,
            type: "standard",
            sellPrice: Number(sellPrice),
            unitPrice: item.unitPrice,
            description: description || undefined,
            imageUrl: selectedImage || undefined,
          };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Could not save. Please try again.");
      return;
    }

    if (itemType === "dish" && item.billId) {
      await relinkBillsForItems([item]);
    }

    onAdded(item.id);
  }

  const categories = itemType === "ingredient" ? INGREDIENT_CATEGORIES : DISH_CATEGORIES;
  const itemLabel = itemType === "ingredient" ? "ingredient" : "menu item";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-chef-text/30 p-3 sm:p-5"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-chef-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
        aria-labelledby="add-catalog-title"
      >
        <div className="border-b border-chef-border bg-chef-amber-light/40 px-5 py-4 sm:px-6">
          <h2 id="add-catalog-title" className="text-xl font-semibold text-chef-text">
            Add this {itemLabel} to your kitchen
          </h2>
          <p className="mt-1 text-sm text-chef-text-muted">
            From <span className="font-medium text-chef-text">{item.sourceFilename}</span>
            {" · "}read from bill as &ldquo;{item.rawName}&rdquo;
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 sm:grid-cols-[1fr_280px] sm:p-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="sc-label" htmlFor="catalog-name">
                    {itemType === "ingredient" ? "Product name" : "Dish name"}
                  </label>
                  <input
                    id="catalog-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="sc-input"
                    required
                  />
                </div>

                {itemType === "ingredient" && (
                  <div className="sm:col-span-2">
                    <label className="sc-label" htmlFor="catalog-brand">
                      Brand or supplier
                    </label>
                    <input
                      id="catalog-brand"
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      placeholder="e.g. Costco, Sysco, Kirkland"
                      className="sc-input"
                    />
                  </div>
                )}

                <div className="sm:col-span-2">
                  <label className="sc-label" htmlFor="catalog-category">
                    Category
                  </label>
                  <select
                    id="catalog-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="sc-input"
                  >
                    {categories.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                {itemType === "ingredient" ? (
                  <>
                    <div>
                      <label className="sc-label" htmlFor="catalog-unit">
                        Unit (lb, oz, each…)
                      </label>
                      <input
                        id="catalog-unit"
                        value={inventoryUnit}
                        onChange={(e) => setInventoryUnit(e.target.value)}
                        className="sc-input"
                      />
                    </div>
                    <div>
                      <p className="sc-label">Stock from this bill</p>
                      <p className="mt-1 text-base text-chef-text">
                        {item.quantity} {item.unit}
                      </p>
                      <p className="mt-0.5 text-sm text-chef-text-muted">
                        Inventory updates when the bill is saved to your kitchen.
                      </p>
                    </div>
                    <div>
                      <label className="sc-label" htmlFor="catalog-reorder">
                        Reorder when below
                      </label>
                      <input
                        id="catalog-reorder"
                        type="number"
                        min="0"
                        step="any"
                        value={reorderThreshold}
                        onChange={(e) => setReorderThreshold(e.target.value)}
                        className="sc-input"
                      />
                    </div>
                    <div>
                      <label className="sc-label">Last price paid</label>
                      <div className="sc-input-readonly">
                        ${item.unitPrice.toFixed(2)} per {item.unit || "unit"}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="sc-label" htmlFor="catalog-price">
                        Menu price
                      </label>
                      <input
                        id="catalog-price"
                        type="number"
                        min="0"
                        step="0.01"
                        value={sellPrice}
                        onChange={(e) => setSellPrice(e.target.value)}
                        className="sc-input"
                      />
                    </div>
                    <div>
                      <label className="sc-label">Sold on bill</label>
                      <div className="sc-input-readonly">
                        {item.quantity} {item.unit}
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="sc-label" htmlFor="catalog-desc">
                        Short description <span className="font-normal text-chef-text-muted">(optional)</span>
                      </label>
                      <input
                        id="catalog-desc"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="e.g. Iced latte with oat milk"
                        className="sc-input"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="rounded-xl bg-chef-sage-light/60 px-4 py-3 text-sm text-chef-sage-dark">
                <span className="font-semibold">Category:</span> {formatCategory(category, itemType)}
                {itemType === "ingredient" && brandName && (
                  <>
                    {" · "}
                    <span className="font-semibold">Brand:</span> {brandName}
                  </>
                )}
              </div>
            </div>

            <aside className="flex flex-col rounded-xl border border-chef-border bg-chef-muted/50 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="sc-label">Product photo</p>
                  <p className="sc-hint mt-0.5">
                    {manualPick ? "You chose this photo" : "Tap a photo to override the suggestion"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => applySuggestedPick(images)}
                    disabled={loadingImages || images.length === 0}
                    className="rounded-lg border border-chef-sage/40 bg-chef-sage-light px-3 py-1.5 text-sm font-medium text-chef-sage-dark hover:bg-chef-sage-light/80 disabled:opacity-50"
                  >
                    Use suggested
                  </button>
                  <button
                    type="button"
                    onClick={refreshImages}
                    disabled={loadingImages}
                    className="rounded-lg border border-chef-border bg-white px-3 py-1.5 text-sm font-medium text-chef-sage hover:bg-chef-sage-light disabled:opacity-50"
                  >
                    {loadingImages ? "Searching…" : "Find photos"}
                  </button>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={imageKeywords}
                  onChange={(e) => setImageKeywords(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      refreshImages();
                    }
                  }}
                  placeholder="Add words to narrow search"
                  className="min-w-0 flex-1 rounded-lg border border-chef-border bg-white px-3 py-2 text-sm"
                  aria-label="Extra search words for photos"
                />
              </div>

              {imageError && <p className="mt-2 text-sm text-red-700">{imageError}</p>}

              {loadingImages ? (
                <div className="mt-3 space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="aspect-[4/3] w-full animate-pulse rounded-xl bg-chef-border" />
                  ))}
                </div>
              ) : images.length === 0 ? (
                <p className="mt-4 text-center text-sm text-chef-text-muted">
                  No photos found yet. Try the Find photos button above.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {images
                    .filter((img) => img.url && !img.url.includes("placehold.co"))
                    .slice(0, 3)
                    .map((img, index) => (
                      <CatalogImage
                        key={img.url}
                        src={img.url}
                        alt={img.label}
                        selected={selectedImage === img.url}
                        onSelect={() => selectImageManually(img.url)}
                        styled={itemType === "dish"}
                        topPick={index === 0 && (img.score ?? 0) > 0}
                      />
                    ))}
                </div>
              )}
            </aside>
          </div>

          {error && (
            <p className="border-t border-chef-border px-5 py-2 text-sm text-red-700 sm:px-6">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-chef-border bg-chef-muted/30 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <button type="button" onClick={onClose} className="sc-btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="sc-btn-primary">
              {saving ? "Saving…" : "Save to kitchen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
