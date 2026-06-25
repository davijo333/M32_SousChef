"use client";

import { useEffect, useRef, useState } from "react";
import {
  formatIngredientPrice,
  formatInventoryLevel,
} from "@backend/services/catalog/ingredient-purchase-stats";
import { formatMenuSellPrice } from "@backend/services/dashboard/menu-sales-stats";
import type { IngredientLabel } from "@backend/models/Ingredient";

export type IngredientPantryInfo = {
  lastPurchasePrice?: number;
  currentQty: number;
  inventoryUnit: string;
  reorderThreshold: number;
};

export type MenuSalesInfo = {
  sellPrice: number;
  totalSold: number;
  soldThisWeek: number;
};

const LABEL_STYLES: Record<IngredientLabel, string> = {
  new: "bg-chef-sage-light text-chef-sage",
  used: "bg-emerald-100 text-emerald-800",
  unused: "bg-chef-muted text-chef-text-muted",
  missing: "bg-chef-amber-light text-chef-amber",
};

function KitchenImage({ src, alt }: { src?: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-chef-muted text-3xl text-chef-text-muted/40">
        🍽
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-cover"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

type Props = {
  name: string;
  imageUrl?: string;
  subtitle?: string;
  menuSales?: MenuSalesInfo;
  ingredientPantry?: IngredientPantryInfo;
  label?: IngredientLabel;
  selected?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
};

export const KITCHEN_CARD_SIZE_CLASS = "h-[18.5rem] w-[10.75rem] sm:w-[11rem]";

export function KitchenCard({
  name,
  imageUrl,
  subtitle,
  menuSales,
  ingredientPantry,
  label,
  selected,
  onClick,
  onDoubleClick,
}: Props) {
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  function handleClick() {
    if (!onDoubleClick) {
      onClick();
      return;
    }
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      onClick();
    }, 250);
  }

  function handleDoubleClick() {
    if (!onDoubleClick) return;
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    onDoubleClick();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className={`flex ${KITCHEN_CARD_SIZE_CLASS} shrink-0 flex-col overflow-hidden rounded-xl border text-left transition ${
        selected
          ? "border-chef-sage ring-2 ring-chef-sage/30"
          : "border-chef-border hover:border-chef-sage/50"
      }`}
    >
      <div className="aspect-square w-full shrink-0 overflow-hidden bg-chef-muted">
        <KitchenImage src={imageUrl} alt={name} />
      </div>
      <div className="flex min-h-[3.5rem] flex-1 flex-col p-3">
        <div className="flex min-h-[2.5rem] items-start justify-between gap-1">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-chef-text">{name}</p>
          {label && (
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${LABEL_STYLES[label]}`}
            >
              {label}
            </span>
          )}
        </div>
        {menuSales ? (
          <div className="mt-1 space-y-0.5 text-[11px] leading-snug text-chef-text-muted">
            <p>
              Price:{" "}
              <span className="font-medium text-chef-text">
                {formatMenuSellPrice(menuSales.sellPrice)}
              </span>
            </p>
            <p>
              Sold Totally:{" "}
              <span className="font-medium text-chef-text">{menuSales.totalSold}</span>
            </p>
            <p>
              Sold This Week:{" "}
              <span className="font-medium text-chef-text">{menuSales.soldThisWeek}</span>
            </p>
          </div>
        ) : ingredientPantry ? (
          <div className="mt-1 space-y-0.5 text-[11px] leading-snug text-chef-text-muted">
            <p>
              Last bought price:{" "}
              <span className="font-medium text-chef-text">
                {formatIngredientPrice(ingredientPantry.lastPurchasePrice)}
              </span>
            </p>
            <p>
              Inventory Level:{" "}
              <span className="font-medium text-chef-text">
                {formatInventoryLevel(
                  ingredientPantry.currentQty,
                  ingredientPantry.inventoryUnit
                )}
              </span>
            </p>
            <p>
              Reorder Level:{" "}
              <span className="font-medium text-chef-text">
                {formatInventoryLevel(
                  ingredientPantry.reorderThreshold,
                  ingredientPantry.inventoryUnit
                )}
              </span>
            </p>
          </div>
        ) : (
          <p className="mt-0.5 line-clamp-1 min-h-[1rem] text-xs text-chef-text-muted">
            {subtitle ?? "\u00a0"}
          </p>
        )}
      </div>
    </button>
  );
}
