"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { prepareNewItemsForReview } from "@/lib/enrich-client";
import { mergeNewCatalogItems, type NewCatalogItem } from "@/lib/extract-new-items";
import { isItemReadyForCard } from "@/lib/image-selection";

export const REVIEW_STORAGE_KEY = "souschef-upload-review";
export const NEW_CATALOG_EVENT = "souschef:new-catalog-items";

export function dispatchNewCatalogEvent() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NEW_CATALOG_EVENT));
  }
}

function patchReadyIntoFull(full: NewCatalogItem[], readyPatch: NewCatalogItem[]): NewCatalogItem[] {
  const patchMap = new Map(readyPatch.map((i) => [i.id, i]));
  return full.map((i) => patchMap.get(i.id) ?? i);
}

export function useNewCatalogReview() {
  const [newIngredients, setNewIngredients] = useState<NewCatalogItem[]>([]);
  const [newDishes, setNewDishes] = useState<NewCatalogItem[]>([]);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [preparingReview, setPreparingReview] = useState(false);
  const [prepareLabel, setPrepareLabel] = useState("");
  const addedItemIdsRef = useRef(new Set<string>());
  const prepareRunRef = useRef(0);
  const inFlightKeysRef = useRef(new Set<string>());

  const persistReview = useCallback(() => {
    sessionStorage.setItem(
      REVIEW_STORAGE_KEY,
      JSON.stringify({
        newIngredients,
        newDishes,
        addedItemIds: Array.from(addedItemIdsRef.current),
        preparingIds: Array.from(inFlightKeysRef.current),
      })
    );
  }, [newIngredients, newDishes]);

  const runPreparePipeline = useCallback(async (ingredients: NewCatalogItem[]) => {
    const queue = ingredients.filter(
      (i) => !isItemReadyForCard(i) && !inFlightKeysRef.current.has(i.id)
    );
    if (!queue.length) return;

    queue.forEach((i) => inFlightKeysRef.current.add(i.id));
    const runId = ++prepareRunRef.current;
    setPreparingReview(true);
    setPrepareLabel("Normalizing names and finding photos…");

    await prepareNewItemsForReview(
      queue,
      [],
      "supplier",
      (batch) => {
        if (runId !== prepareRunRef.current) return;
        if (batch.ingredients.length) {
          setNewIngredients((prev) => mergeNewCatalogItems(prev, batch.ingredients));
        }
        dispatchNewCatalogEvent();
      },
      () => {
        queue.forEach((i) => inFlightKeysRef.current.delete(i.id));
        if (runId === prepareRunRef.current) {
          setPreparingReview(false);
          setPrepareLabel("");
        }
      }
    );
  }, []);

  const loadFromSession = useCallback(async () => {
    setSessionLoading(true);
    try {
      const res = await fetch("/api/bills/session");
      if (!res.ok) return;
      const data = await res.json();

      let ingredients: NewCatalogItem[] = data.newCatalogItems?.ingredients ?? [];
      let dishes: NewCatalogItem[] = data.newCatalogItems?.dishes ?? [];

      try {
        const saved = sessionStorage.getItem(REVIEW_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as {
            newIngredients?: NewCatalogItem[];
            newDishes?: NewCatalogItem[];
            addedItemIds?: string[];
            preparingIds?: string[];
          };
          (parsed.addedItemIds ?? []).forEach((id) => addedItemIdsRef.current.add(id));
          (parsed.preparingIds ?? []).forEach((id) => inFlightKeysRef.current.add(id));
          const skipAdded = (items: NewCatalogItem[]) =>
            items.filter((item) => !addedItemIdsRef.current.has(item.id));
          ingredients = mergeNewCatalogItems(
            skipAdded(ingredients),
            skipAdded(parsed.newIngredients ?? [])
          );
          dishes = mergeNewCatalogItems(skipAdded(dishes), skipAdded(parsed.newDishes ?? []));
        }
      } catch {
        // ignore
      }

      setNewIngredients(ingredients);
      setNewDishes(dishes);
      const needPrepare = ingredients.filter((i) => !isItemReadyForCard(i));
      if (needPrepare.length) void runPreparePipeline(needPrepare);
    } finally {
      setSessionLoading(false);
    }
  }, [runPreparePipeline]);

  useEffect(() => {
    loadFromSession();

    function syncFromStorage() {
      try {
        const saved = sessionStorage.getItem(REVIEW_STORAGE_KEY);
        if (!saved) return;
        const parsed = JSON.parse(saved) as {
          newIngredients?: NewCatalogItem[];
          newDishes?: NewCatalogItem[];
        };
        if (parsed.newIngredients) setNewIngredients(parsed.newIngredients);
        if (parsed.newDishes) setNewDishes(parsed.newDishes);
      } catch {
        // ignore
      }
    }

    window.addEventListener(NEW_CATALOG_EVENT, syncFromStorage);
    return () => window.removeEventListener(NEW_CATALOG_EVENT, syncFromStorage);
  }, [loadFromSession]);

  useEffect(() => {
    if (sessionLoading) return;
    persistReview();
  }, [newIngredients, newDishes, sessionLoading, persistReview]);

  const discoverItems = useCallback(
    (items: { ingredients?: NewCatalogItem[]; dishes?: NewCatalogItem[] }) => {
      const ingredients = (items.ingredients ?? [])
        .filter((item) => !addedItemIdsRef.current.has(item.id))
        .map((i) => ({
          ...i,
          imagesLoading: isItemReadyForCard(i) ? false : (i.imagesLoading ?? true),
        }));
      const dishes = (items.dishes ?? []).filter((item) => !addedItemIdsRef.current.has(item.id));
      if (!ingredients.length && !dishes.length) return;
      if (ingredients.length) {
        setNewIngredients((prev) => mergeNewCatalogItems(prev, ingredients));
        const needPrepare = ingredients.filter((i) => !isItemReadyForCard(i));
        if (needPrepare.length) void runPreparePipeline(needPrepare);
      }
      if (dishes.length) {
        setNewDishes((prev) => mergeNewCatalogItems(prev, dishes));
      }
      dispatchNewCatalogEvent();
    },
    [runPreparePipeline]
  );

  const handleBillsConfirmed = useCallback(
    (items: { ingredients?: NewCatalogItem[]; dishes?: NewCatalogItem[] }) => {
      discoverItems(items);
      dispatchNewCatalogEvent();
    },
    [discoverItems]
  );

  const markItemsAdded = useCallback((ids: string[]) => {
    ids.forEach((id) => addedItemIdsRef.current.add(id));
    const idSet = new Set(ids);
    setNewIngredients((prev) => prev.filter((item) => !idSet.has(item.id)));
    setNewDishes((prev) => prev.filter((item) => !idSet.has(item.id)));
  }, []);

  const clearItemsForBills = useCallback((billIds: string[]) => {
    const idSet = new Set(billIds);
    setNewIngredients((prev) => {
      prev.filter((i) => idSet.has(i.billId)).forEach((i) => addedItemIdsRef.current.add(i.id));
      return prev.filter((i) => !idSet.has(i.billId));
    });
    setNewDishes((prev) => {
      prev.filter((i) => idSet.has(i.billId)).forEach((i) => addedItemIdsRef.current.add(i.id));
      return prev.filter((i) => !idSet.has(i.billId));
    });
  }, []);

  const handleBillsProcessed = useCallback(
    (billIds: string[]) => {
      clearItemsForBills(billIds);
      if (newIngredients.length === 0 && newDishes.length === 0) {
        sessionStorage.removeItem(REVIEW_STORAGE_KEY);
      }
    },
    [clearItemsForBills, newIngredients.length, newDishes.length]
  );

  const handleIngredientAdded = useCallback(
    (id: string, billId?: string) => {
      markItemsAdded([id]);
      if (!billId) return;
      const remaining = newIngredients.some((i) => i.id !== id && i.billId === billId);
      if (!remaining) handleBillsProcessed([billId]);
    },
    [markItemsAdded, newIngredients, handleBillsProcessed]
  );

  const handleDishAdded = useCallback(
    (id: string, billId?: string) => {
      markItemsAdded([id]);
      if (!billId) return;
      const remaining = newDishes.some((i) => i.id !== id && i.billId === billId);
      if (!remaining) handleBillsProcessed([billId]);
    },
    [markItemsAdded, newDishes, handleBillsProcessed]
  );

  const readyIngredients = useMemo(
    () => newIngredients.filter(isItemReadyForCard),
    [newIngredients]
  );
  const pendingCount = newIngredients.filter((i) => i.imagesLoading).length;

  const updateIngredients = useCallback((items: NewCatalogItem[]) => {
    setNewIngredients((prev) => patchReadyIntoFull(prev, items));
  }, []);

  const updateDishes = useCallback((items: NewCatalogItem[]) => {
    setNewDishes((prev) => patchReadyIntoFull(prev, items));
  }, []);

  return {
    sessionLoading,
    preparingReview,
    prepareLabel,
    newIngredients,
    newDishes,
    readyIngredients,
    pendingCount,
    handleBillsConfirmed,
    discoverItems,
    handleBillRemoved: clearItemsForBills,
    handleBillsProcessed,
    handleIngredientAdded,
    handleDishAdded,
    markItemsAdded,
    reloadSession: loadFromSession,
    updateIngredients,
    updateDishes,
  };
}
