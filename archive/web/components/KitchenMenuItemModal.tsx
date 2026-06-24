"use client";

import { useState } from "react";

type AddOnRow = {
  slug: string;
  name: string;
  sellPrice: number;
};

type MenuItemDetail = {
  slug: string;
  name: string;
  imageUrl?: string;
  sellPrice: number;
  type?: string;
  addonsEnabled: boolean;
  availableAddOns: AddOnRow[];
  totalSold: number;
  totalRevenue: number;
  uniqueCustomers: number;
  ingredientLinks: Array<{ ingredientSlug: string; qtyPerServing: number; unit: string }>;
};

type Props = {
  item: MenuItemDetail;
  allAddOns: AddOnRow[];
  ingredientNames: Map<string, string>;
  onClose: () => void;
  onUpdated: (patch: Partial<MenuItemDetail>) => void;
};

export function KitchenMenuItemModal({
  item,
  allAddOns,
  ingredientNames,
  onClose,
  onUpdated,
}: Props) {
  const [addonsEnabled, setAddonsEnabled] = useState(item.addonsEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const shownAddOns =
    item.availableAddOns.length > 0
      ? item.availableAddOns
      : addonsEnabled
        ? allAddOns
        : [];

  async function toggleAddons(enabled: boolean) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/catalog/menu-items/${encodeURIComponent(item.slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addonsEnabled: enabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not update");
        return;
      }
      setAddonsEnabled(enabled);
      onUpdated({ addonsEnabled: enabled });
    } catch {
      setError("Network error");
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
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-chef-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-semibold text-chef-text">{item.name}</h2>
          <button type="button" onClick={onClose} className="text-chef-text-muted hover:text-chef-text">
            ✕
          </button>
        </div>

        {item.imageUrl && (
          <div className="mt-4 aspect-video overflow-hidden rounded-xl bg-chef-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
          </div>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-chef-muted/60 p-3">
            <dt className="text-chef-text-muted">Unit price</dt>
            <dd className="mt-1 text-lg font-semibold text-chef-text">${item.sellPrice.toFixed(2)}</dd>
          </div>
          <div className="rounded-lg bg-chef-muted/60 p-3">
            <dt className="text-chef-text-muted">Total sold</dt>
            <dd className="mt-1 text-lg font-semibold text-chef-text">{item.totalSold}</dd>
          </div>
          <div className="rounded-lg bg-chef-muted/60 p-3">
            <dt className="text-chef-text-muted">Total revenue</dt>
            <dd className="mt-1 text-lg font-semibold text-chef-text">${item.totalRevenue.toFixed(2)}</dd>
          </div>
          <div className="rounded-lg bg-chef-muted/60 p-3">
            <dt className="text-chef-text-muted">Unique customers</dt>
            <dd className="mt-1 text-lg font-semibold text-chef-text">{item.uniqueCustomers}</dd>
          </div>
        </dl>

        {(item.type === "customizable" || item.type === "signature" || allAddOns.length > 0) && (
          <div className="mt-5 rounded-xl border border-chef-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-chef-text">Add-ons</h3>
                <p className="text-xs text-chef-text-muted">Separate sub-dishes guests can add</p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-chef-text">
                <span>{addonsEnabled ? "Allowed" : "Off"}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={addonsEnabled}
                  disabled={saving}
                  onClick={() => toggleAddons(!addonsEnabled)}
                  className={`relative h-7 w-12 rounded-full transition ${
                    addonsEnabled ? "bg-chef-sage" : "bg-chef-border"
                  } disabled:opacity-50`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                      addonsEnabled ? "left-5" : "left-0.5"
                    }`}
                  />
                </button>
              </label>
            </div>

            {addonsEnabled && shownAddOns.length > 0 && (
              <ul className="mt-3 space-y-2">
                {shownAddOns.map((addon) => (
                  <li
                    key={addon.slug}
                    className="flex items-center justify-between rounded-lg bg-chef-muted/60 px-3 py-2 text-sm"
                  >
                    <span className="text-chef-text">{addon.name}</span>
                    <span className="font-medium text-chef-sage">+${addon.sellPrice.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            )}

            {addonsEnabled && shownAddOns.length === 0 && (
              <p className="mt-2 text-sm text-chef-text-muted">No add-ons in your kitchen yet.</p>
            )}
          </div>
        )}

        {item.ingredientLinks.length > 0 ? (
          <div className="mt-5">
            <h3 className="text-sm font-semibold text-chef-text">Recipe ingredients</h3>
            <ul className="mt-2 space-y-1 text-sm text-chef-text-muted">
              {item.ingredientLinks.map((link) => (
                <li key={link.ingredientSlug}>
                  {link.qtyPerServing} {link.unit}{" "}
                  {ingredientNames.get(link.ingredientSlug) ?? link.ingredientSlug}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-5 text-sm text-chef-amber">No recipe links yet — use Link recipes on the kitchen page.</p>
        )}

        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      </div>
    </div>
  );
}
