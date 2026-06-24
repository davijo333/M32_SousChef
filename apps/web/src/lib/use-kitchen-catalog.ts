"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export type CatalogIngredient = {
  name: string;
  slug: string;
  inventoryUnit: string;
  currentQty: number;
  category: string;
};

export type CatalogMenuItem = {
  name: string;
  slug: string;
  category: string;
  sellPrice: number;
  ingredientLinks?: Array<{
    ingredientSlug: string;
    qtyPerServing: number;
    unit: string;
    scalesWithSize?: boolean;
  }>;
};

export type KitchenCatalog = {
  restaurant: { name: string; isSeeded: boolean };
  ingredients: CatalogIngredient[];
  menuItems: CatalogMenuItem[];
  expiring: Array<{
    name: string;
    currentQty: number;
    inventoryUnit: string;
    expiryDate: string;
  }>;
  lowStock: Array<{
    name: string;
    currentQty: number;
    reorderThreshold: number;
    inventoryUnit: string;
  }>;
};

export function useKitchenCatalog() {
  const router = useRouter();
  const [data, setData] = useState<KitchenCatalog | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [dashRes, ingRes, menuRes] = await Promise.all([
      fetch("/api/dashboard"),
      fetch("/api/catalog/ingredients"),
      fetch("/api/catalog/menu-items"),
    ]);

    if (dashRes.status === 401) {
      router.push("/login");
      return;
    }

    const dash = dashRes.ok ? await dashRes.json() : {};
    const ing = ingRes.ok ? await ingRes.json() : { ingredients: [] };
    const menu = menuRes.ok ? await menuRes.json() : { menuItems: [] };

    setData({
      restaurant: dash.restaurant ?? { name: "Your kitchen", isSeeded: false },
      ingredients: ing.ingredients ?? [],
      menuItems: menu.menuItems ?? [],
      expiring: dash.expiring ?? [],
      lowStock: dash.lowStock ?? [],
    });
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const hasCatalog =
    !!data && data.ingredients.length > 0 && data.menuItems.length > 0;

  return { data, loading, hasCatalog, reload: load };
}
