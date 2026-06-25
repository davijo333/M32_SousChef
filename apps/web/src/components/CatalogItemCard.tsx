"use client";

import { useState } from "react";
import type { ImageSuggestion, NewCatalogItem } from "@backend/services/catalog/extract-new-items";
import { REQUIRED_CARD_IMAGES, resolveItemImageUrl, sortImagesByScore } from "@backend/services/catalog/image-selection";

function CatalogImage({
  src,
  alt,
  styled,
}: {
  src: string;
  alt: string;
  styled?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return <div className="h-full w-full bg-chef-muted" aria-hidden />;
  }

  return (
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
  );
}

function ImageStrip({
  images,
  loading,
  name,
  styled,
  selectedUrl,
}: {
  images: ImageSuggestion[];
  loading?: boolean;
  name: string;
  styled?: boolean;
  selectedUrl?: string;
}) {
  if (loading) {
    return (
      <div className="flex h-[4.5rem] gap-1.5">
        {Array.from({ length: REQUIRED_CARD_IMAGES }, (_, i) => (
          <div key={i} className="flex-1 animate-pulse rounded-lg bg-chef-border" />
        ))}
      </div>
    );
  }

  const slots = sortImagesByScore(
    images.filter((img) => img.url && !img.url.includes("placehold.co"))
  ).slice(0, REQUIRED_CARD_IMAGES);

  if (slots.length === 0) {
    return (
      <div className="flex h-[4.5rem] items-center justify-center rounded-lg bg-chef-muted text-sm text-chef-text-muted">
        Finding photos…
      </div>
    );
  }

  return (
    <div className="flex h-[4.5rem] gap-1.5">
      {slots.map((img, i) => (
        <div
          key={`${img.url}-${i}`}
          className={`relative flex-1 overflow-hidden rounded-lg border bg-chef-muted ${
            selectedUrl === img.url
              ? "border-chef-sage ring-2 ring-chef-sage/25"
              : "border-chef-border"
          }`}
        >
          <CatalogImage src={img.url} alt={img.label || name} styled={styled} />
          {i === 0 && img.score != null && img.score > 0 && !selectedUrl && (
            <span className="absolute bottom-0 left-0 right-0 bg-chef-sage/85 px-1 py-0.5 text-center text-[10px] font-medium text-white">
              Best match
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function AttributeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="shrink-0 text-chef-text-muted">{label}</span>
      <span className="truncate text-right font-medium text-chef-text">{value}</span>
    </div>
  );
}

export function CatalogItemCard({
  item,
  kind,
  included,
  onToggleIncluded,
  onConfirm,
  variant = "default",
}: {
  item: NewCatalogItem;
  kind: "ingredient" | "dish";
  included: boolean;
  onToggleIncluded: (included: boolean) => void;
  onConfirm: () => void;
  variant?: "default" | "missing";
}) {
  const isMissing = variant === "missing";
  const priceLabel =
    item.unitPrice > 0
      ? kind === "ingredient"
        ? `$${item.unitPrice.toFixed(2)}/${item.unit}`
        : `$${item.unitPrice.toFixed(2)}`
      : "—";

  const displayUrl = resolveItemImageUrl(item);
  const photoStatus = item.imageSelectionManual
    ? "Your photo"
    : item.selectedImageUrl
      ? "Suggested photo"
      : null;

  return (
    <div
      className={`relative flex w-60 shrink-0 flex-col rounded-2xl border p-3.5 shadow-sm transition ${
        isMissing
          ? included
            ? "border-red-400 bg-red-50/80 ring-2 ring-red-400/25"
            : "border-dashed border-red-300 bg-red-50/40 opacity-80"
          : included
            ? "border-chef-border bg-chef-surface"
            : "border-dashed border-chef-border bg-chef-muted/60 opacity-75"
      }`}
    >
      {isMissing && (
        <div
          className="pointer-events-none absolute inset-0 z-10 rounded-2xl bg-gradient-to-b from-red-500/15 via-red-500/5 to-red-600/20"
          aria-hidden
        />
      )}
      {isMissing && (
        <span className="absolute left-2 top-2 z-20 rounded-md bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
          Missing
        </span>
      )}
      <label className="relative z-20 flex cursor-pointer items-center gap-2.5 rounded-lg border border-chef-border bg-chef-muted/40 px-2.5 py-2">
        <input
          type="checkbox"
          checked={included}
          onChange={(e) => onToggleIncluded(e.target.checked)}
          className="h-5 w-5 shrink-0 rounded border-chef-border text-chef-sage focus:ring-chef-sage/30"
        />
        <span className="text-sm font-semibold text-chef-text">
          {isMissing
            ? included
              ? "Add missing ingredient"
              : "Skip for now"
            : included
              ? "Add to kitchen"
              : "Skip this item"}
        </span>
      </label>

      {displayUrl ? (
        <div className="relative z-0 mt-3 h-[4.5rem] overflow-hidden rounded-lg border border-chef-border">
          <CatalogImage src={displayUrl} alt={item.name} styled={kind === "dish"} />
          {photoStatus && (
            <span
              className={`absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                item.imageSelectionManual
                  ? "bg-chef-amber text-white"
                  : "bg-chef-sage text-white"
              }`}
            >
              {photoStatus}
            </span>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <ImageStrip
            images={item.imageSuggestions}
            loading={item.imagesLoading}
            name={item.name}
            styled={kind === "dish"}
            selectedUrl={item.selectedImageUrl}
          />
        </div>
      )}

      <p className="mt-3 line-clamp-2 min-h-[2.75rem] text-base font-semibold leading-snug text-chef-text">
        {item.name}
      </p>

      <div className="mt-2 space-y-1.5 border-t border-chef-border pt-2">
        {kind === "ingredient" ? (
          <>
            {isMissing && (
              <AttributeRow label="Why" value={item.rawName} />
            )}
            <AttributeRow label="Brand" value={item.brandName || "—"} />
            <AttributeRow label="Qty" value={`${item.quantity} ${item.unit}`} />
            <AttributeRow label="Price" value={priceLabel} />
          </>
        ) : (
          <>
            <AttributeRow label="Type" value="Menu item" />
            <AttributeRow label="Sold" value={`${item.quantity} ${item.unit}`} />
            <AttributeRow label="Price" value={priceLabel} />
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onConfirm}
        className={`relative z-20 mt-3 w-full rounded-xl border py-2.5 text-sm font-medium ${
          isMissing
            ? "border-red-300 bg-white text-red-800 hover:bg-red-50"
            : "border-chef-border bg-white text-chef-text hover:bg-chef-muted"
        }`}
      >
        Review details
      </button>
    </div>
  );
}
