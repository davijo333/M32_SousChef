"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CatalogEmptyPrompt } from "@/components/CatalogEmptyPrompt";
import { KitchenCard } from "@/components/KitchenCard";
import { KitchenIngredientModal, type IngredientDetail } from "@/components/KitchenIngredientModal";
import { Nav } from "@/components/Nav";
import { useKitchenName } from "@/components/KitchenNameProvider";
import { NewItemsEnrichingPanel } from "@/components/NewItemsEnrichingPanel";
import { NewItemsReview } from "@/components/NewItemsReview";
import { ingredientMissingPhotos } from "@/lib/ingredient-image-status";
import { useNewCatalogReview, NEW_CATALOG_EVENT } from "@/lib/use-new-catalog-review";

type IngredientRow = IngredientDetail & {
  category: string;
};

type KitchenPayload = {
  restaurant: { name: string; isSeeded: boolean };
  ingredients: IngredientRow[];
};

export default function KitchenControlPage() {
  const router = useRouter();
  const review = useNewCatalogReview();
  const { restaurant: kitchenProfile } = useKitchenName();
  const [data, setData] = useState<KitchenPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingredientModal, setIngredientModal] = useState<IngredientRow | null>(null);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");
  const [pantrySearch, setPantrySearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/kitchen");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (!res.ok) return;
    setData(await res.json());
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const refresh = () => {
      void load();
    };
    window.addEventListener(NEW_CATALOG_EVENT, refresh);
    return () => window.removeEventListener(NEW_CATALOG_EVENT, refresh);
  }, [load]);

  const kitchen = data ?? {
    restaurant: { name: "Your kitchen", isSeeded: false },
    ingredients: [] as IngredientRow[],
  };

  const missingPhotoCount = useMemo(
    () => kitchen.ingredients.filter((item) => ingredientMissingPhotos(item)).length,
    [kitchen.ingredients]
  );

  const brandOptions = useMemo(() => {
    const brands = new Set<string>();
    for (const item of kitchen.ingredients) {
      const brand = item.brandName?.trim();
      if (brand) brands.add(brand);
    }
    return Array.from(brands).sort((a, b) => a.localeCompare(b));
  }, [kitchen.ingredients]);

  const filteredIngredients = useMemo(() => {
    const nameQuery = pantrySearch.trim().toLowerCase();
    return kitchen.ingredients.filter((item) => {
      if (brandFilter && (item.brandName ?? "") !== brandFilter) return false;
      if (!nameQuery) return true;
      return item.name.toLowerCase().includes(nameQuery);
    });
  }, [kitchen.ingredients, pantrySearch, brandFilter]);

  const pantryFiltersActive = Boolean(pantrySearch.trim() || brandFilter);

  async function handleGenerateMissingImages() {
    setBulkGenerating(true);
    setBulkMessage("");
    try {
      const res = await fetch("/api/catalog/ingredients/generate-missing-images", {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) {
        setBulkMessage(body.error ?? "Could not generate images");
        return;
      }
      const { generated, failed, attempted } = body as {
        generated: number;
        attempted: number;
        failed: number;
      };
      if (attempted === 0) {
        setBulkMessage("All pantry items already have photos.");
      } else if (failed === 0) {
        setBulkMessage(`Generated images for ${generated} ingredient${generated === 1 ? "" : "s"}.`);
      } else {
        setBulkMessage(
          `Generated ${generated} of ${attempted}; ${failed} failed. Try again or use per-item Generate.`
        );
      }
      await load();
    } catch {
      setBulkMessage("Could not generate images. Is the agent running?");
    } finally {
      setBulkGenerating(false);
    }
  }

  if (loading && !data && review.sessionLoading) {
    return (
      <>
        <Nav />
        <p className="p-8 text-chef-text-muted">Loading your kitchen…</p>
      </>
    );
  }

  const empty = kitchen.ingredients.length === 0 && review.newIngredients.length === 0;
  const hasLeftContent =
    review.preparingReview ||
    review.pendingCount > 0 ||
    review.newIngredients.length > 0 ||
    empty;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold text-chef-text sm:text-3xl">Kitchen control</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-base text-chef-text-muted">
              {kitchenProfile?.kitchenNameSet ? kitchenProfile.name : kitchen.restaurant.name}
            </p>
          </div>
        </div>

        {empty ? (
          <CatalogEmptyPrompt
            title="No ingredients yet"
            description="Upload purchase orders to build your pantry. PDF or PNG invoices with .s_bill. in the filename."
          />
        ) : (
          <div className="mt-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
            <div className="min-w-0">
              {!review.sessionLoading && (review.preparingReview || review.pendingCount > 0) && (
                <NewItemsEnrichingPanel
                  readyCount={review.readyIngredients.length}
                  totalCount={review.newIngredients.length}
                  statusLabel={review.prepareLabel}
                />
              )}

              {!review.sessionLoading && review.newIngredients.length > 0 && (
                <section className={review.preparingReview || review.pendingCount > 0 ? "mt-6" : ""}>
                  <NewItemsReview
                    newIngredients={review.newIngredients}
                    newDishes={[]}
                    missingIngredients={[]}
                    onIngredientAdded={(id, billId) => {
                      review.handleIngredientAdded(id, billId);
                      void load();
                    }}
                    onDishAdded={() => {}}
                    onMissingIngredientAdded={() => {}}
                    onIngredientsChange={review.updateIngredients}
                    onDishesChange={() => {}}
                    onMissingIngredientsChange={() => {}}
                    onBillsProcessed={review.handleBillsProcessed}
                    onItemsAdded={(ids) => {
                      review.markItemsAdded(ids);
                      void load();
                    }}
                  />
                </section>
              )}

              {!hasLeftContent && (
                <p className="text-sm text-chef-text-muted">
                  New items from purchase orders will appear here for review.
                </p>
              )}

              <p className="mt-6 text-sm text-chef-text-muted">
                Need more stock?{" "}
                <Link href="/upload-orders" className="text-chef-sage underline">
                  Upload purchase orders
                </Link>{" "}
                and click Process.
              </p>
            </div>

            <aside className="mt-8 min-w-0 lg:mt-0 lg:sticky lg:top-6">
              <section className="rounded-2xl border border-chef-border bg-chef-surface/50 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-chef-text">Pantry</h2>
                    <p className="mt-1 text-sm text-chef-text-muted">
                      Stock from processed orders. Tap an item for details.
                    </p>
                  </div>
                  {missingPhotoCount > 0 && (
                    <button
                      type="button"
                      disabled={bulkGenerating}
                      onClick={() => void handleGenerateMissingImages()}
                      className="shrink-0 rounded-lg border border-chef-sage/50 px-3 py-1.5 text-sm font-medium text-chef-sage hover:bg-chef-sage-light/40 disabled:opacity-50"
                    >
                      {bulkGenerating
                        ? "Generating…"
                        : `Generate images for missing (${missingPhotoCount})`}
                    </button>
                  )}
                </div>

                {bulkMessage && (
                  <p className="mt-3 text-sm text-chef-text-muted">{bulkMessage}</p>
                )}

                {kitchen.ingredients.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <label className="block flex-1 text-sm">
                        <span className="sr-only">Search ingredient name</span>
                        <input
                          type="search"
                          value={pantrySearch}
                          onChange={(e) => setPantrySearch(e.target.value)}
                          placeholder="Search ingredient name…"
                          className="w-full rounded-lg border border-chef-muted bg-white px-3 py-2 text-sm text-chef-text placeholder:text-chef-text-muted/70"
                        />
                      </label>
                      <label className="block shrink-0 text-sm sm:w-44">
                        <span className="sr-only">Filter by brand</span>
                        <select
                          value={brandFilter}
                          onChange={(e) => setBrandFilter(e.target.value)}
                          className="w-full rounded-lg border border-chef-muted bg-white px-3 py-2 text-sm text-chef-text"
                        >
                          <option value="">All brands</option>
                          {brandOptions.map((brand) => (
                            <option key={brand} value={brand}>
                              {brand}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-chef-text-muted">
                      <span>
                        {filteredIngredients.length} of {kitchen.ingredients.length} items
                      </span>
                      {pantryFiltersActive && (
                        <button
                          type="button"
                          onClick={() => {
                            setPantrySearch("");
                            setBrandFilter("");
                          }}
                          className="font-medium text-chef-sage hover:underline"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {kitchen.ingredients.length === 0 ? (
                  <p className="mt-4 text-sm text-chef-text-muted">
                    No pantry items yet. Process a purchase order to add stock.
                  </p>
                ) : filteredIngredients.length === 0 ? (
                  <p className="mt-4 text-sm text-chef-text-muted">
                    No ingredients match your search or brand filter.
                  </p>
                ) : (
                  <div className="mt-3 flex max-h-[calc(100vh-16rem)] flex-wrap gap-3 overflow-y-auto pb-2">
                    {filteredIngredients.map((item) => (
                      <KitchenCard
                        key={`${item.slug}:${item.imageUrl ?? ""}:${item.selectedImageIndex ?? 0}`}
                        name={item.name}
                        imageUrl={item.imageUrl}
                        subtitle={`${item.currentQty} ${item.inventoryUnit}`}
                        onClick={() => setIngredientModal(item)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </aside>
          </div>
        )}
      </main>

      {ingredientModal && (
        <KitchenIngredientModal
          item={ingredientModal}
          onClose={() => setIngredientModal(null)}
          onSaved={(updated) => {
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    ingredients: prev.ingredients.map((row) =>
                      row.slug === updated.slug ? { ...row, ...updated } : row
                    ),
                  }
                : prev
            );
            void load();
          }}
        />
      )}
    </>
  );
}
