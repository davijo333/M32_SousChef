"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CatalogEmptyPrompt } from "@/components/CatalogEmptyPrompt";
import { KitchenClassifiedGrid } from "@/components/KitchenClassifiedGrid";
import { Nav } from "@/components/Nav";
import {
  PantryMultiSelectFilter,
  type MultiSelectOption,
} from "@/components/PantryMultiSelectFilter";
import {
  RecipeDetailModal,
  type RecipeLink,
  type RecipeMeta,
  type RecipeModalItem,
} from "@/components/RecipeDetailModal";
import { RecipeTile } from "@/components/RecipeTile";
import {
  dishClassKey,
  dishClassLabel,
  dishSubclassKey,
  formatClassificationLabel,
  groupByClassSubclass,
} from "@/lib/catalog-classification";
import { formatSuggestedMenuName } from "@/lib/suggested-menu-name";
import type { SuggestionNote } from "@/lib/suggestion-notes";

type RecipeStatus = "new" | "active" | "inactive" | "suggested";
type StatusTab = RecipeStatus;

type RecipeProgressItem = {
  kind: "dish" | "addon";
  slug: string;
  name: string;
  recipeNumber: number;
  progress: "linking" | "pricing";
  progressMessage?: string;
};

type DishRecipe = {
  slug: string;
  name: string;
  category: string;
  classification: string;
  sellPrice: number;
  imageUrl?: string;
  ingredientLinks: RecipeLink[];
  hasRecipe: boolean;
  recipeStatus?: RecipeStatus;
  suggestionNotes?: SuggestionNote[];
  recipe?: RecipeMeta;
};

type AddOnRecipe = {
  slug: string;
  name: string;
  classification: string;
  sellPrice: number;
  linkedDishSlugs: string[];
  linkedDishNames: string[];
  ingredientLinks: RecipeLink[];
  hasRecipe: boolean;
  recipeStatus?: RecipeStatus;
  recipe?: RecipeMeta;
};

type RecipesPayload = {
  recipeAgentCooking?: boolean;
  inProgress?: RecipeProgressItem[];
  dishes: DishRecipe[];
  addOns: AddOnRecipe[];
  counts: {
    dishes: number;
    dishesWithRecipes: number;
    addOns: number;
    new: number;
    active: number;
    inactive: number;
    suggested: number;
  };
};

type SelectableItem = { kind: "dish" | "addon"; slug: string };

const TABS: { id: StatusTab; label: string }[] = [
  { id: "new", label: "New" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "suggested", label: "Suggested" },
];

function effectiveStatus(item: { hasRecipe: boolean; recipeStatus?: RecipeStatus }): RecipeStatus | undefined {
  if (!item.hasRecipe) return undefined;
  return item.recipeStatus ?? "new";
}

function displayRecipeName(name: string, tab: StatusTab): string {
  return tab === "suggested" ? formatSuggestedMenuName(name) : name;
}

function dishToModalItem(dish: DishRecipe, tab: StatusTab): RecipeModalItem {
  return {
    kind: "dish",
    slug: dish.slug,
    name: displayRecipeName(dish.name, tab),
    classification: dish.classification,
    sellPrice: dish.sellPrice,
    imageUrl: dish.imageUrl,
    ingredientLinks: dish.ingredientLinks,
    recipe: dish.recipe,
    suggestionNotes: dish.suggestionNotes,
  };
}

function addOnToModalItem(addOn: AddOnRecipe, tab: StatusTab): RecipeModalItem {
  return {
    kind: "addon",
    slug: addOn.slug,
    name: displayRecipeName(addOn.name, tab),
    classification: addOn.classification,
    sellPrice: addOn.sellPrice,
    linkedDishNames: addOn.linkedDishNames,
    ingredientLinks: addOn.ingredientLinks,
    recipe: addOn.recipe,
  };
}

function recipeClassKey(classification: string): string {
  return dishClassKey(classification);
}

function recipeClassLabel(classKey: string): string {
  return dishClassLabel(classKey);
}

function addOnClassKey(classification: string): string {
  return (classification ?? "addon").trim().toLowerCase() || "addon";
}

function recipeInProgress(recipe?: RecipeMeta): boolean {
  return Boolean(recipe && recipe.progress !== "ready" && recipe.progress !== "failed");
}

export default function RecipesPage() {
  const router = useRouter();
  const [data, setData] = useState<RecipesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [classFilters, setClassFilters] = useState<string[]>([]);
  const [tab, setTab] = useState<StatusTab>("new");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activating, setActivating] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [recipeAgentCooking, setRecipeAgentCooking] = useState(false);
  const [modalItem, setModalItem] = useState<RecipeModalItem | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/recipes");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (!res.ok) return;
    const payload = (await res.json()) as RecipesPayload;
    setData(payload);
    setRecipeAgentCooking(Boolean(payload.recipeAgentCooking));
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!recipeAgentCooking && !(data?.inProgress?.length ?? 0)) return;
    const id = window.setInterval(() => {
      void load();
    }, 2000);
    return () => window.clearInterval(id);
  }, [recipeAgentCooking, data?.inProgress?.length, load]);

  useEffect(() => {
    if (tab !== "active" && tab !== "inactive") {
      setSearch("");
      setClassFilters([]);
    }
  }, [tab]);

  const matchesRecipeSearch = useCallback(
    (name: string) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return name.toLowerCase().includes(q);
    },
    [search]
  );

  const tabDishes = useMemo(() => {
    const dishes = data?.dishes ?? [];
    return dishes.filter((d) => effectiveStatus(d) === tab);
  }, [data?.dishes, tab]);

  const tabAddOns = useMemo(() => {
    const addOns = data?.addOns ?? [];
    return addOns.filter((a) => effectiveStatus(a) === tab);
  }, [data?.addOns, tab]);

  const classFilterOptions = useMemo((): MultiSelectOption[] => {
    if (tab !== "active" && tab !== "inactive") return [];
    const keys = new Set<string>();
    for (const dish of tabDishes) keys.add(recipeClassKey(dish.classification));
    for (const addOn of tabAddOns) keys.add(addOnClassKey(addOn.classification));
    return Array.from(keys)
      .sort((a, b) => recipeClassLabel(a).localeCompare(recipeClassLabel(b)))
      .map((value) => ({ value, label: recipeClassLabel(value) }));
  }, [tab, tabDishes, tabAddOns]);

  const filteredDishes = useMemo(() => {
    return tabDishes.filter((d) => {
      if (tab === "active" || tab === "inactive") {
        if (!matchesRecipeSearch(d.name)) return false;
        if (
          classFilters.length > 0 &&
          !classFilters.includes(recipeClassKey(d.classification))
        ) {
          return false;
        }
      }
      return true;
    });
  }, [tabDishes, tab, matchesRecipeSearch, classFilters]);

  const filteredAddOns = useMemo(() => {
    return tabAddOns.filter((a) => {
      if (tab === "active" || tab === "inactive") {
        if (!matchesRecipeSearch(a.name)) return false;
        if (
          classFilters.length > 0 &&
          !classFilters.includes(addOnClassKey(a.classification))
        ) {
          return false;
        }
      }
      return true;
    });
  }, [tabAddOns, tab, matchesRecipeSearch, classFilters]);

  const dishGroups = useMemo(
    () =>
      groupByClassSubclass(
        filteredDishes,
        (item) => dishClassKey(item.classification),
        (item) => dishSubclassKey(item.classification),
        dishClassLabel,
        formatClassificationLabel
      ),
    [filteredDishes]
  );

  const addOnGroups = useMemo(
    () =>
      groupByClassSubclass(
        filteredAddOns,
        (item) => (item.classification ?? "addon").trim().toLowerCase() || "addon",
        (item) => (item.classification ?? "addon").trim().toLowerCase() || "addon",
        formatClassificationLabel,
        formatClassificationLabel
      ),
    [filteredAddOns]
  );

  const newItems = useMemo((): SelectableItem[] => {
    if (!data) return [];
    const items: SelectableItem[] = [];
    for (const d of data.dishes) {
      if (effectiveStatus(d) === "new") items.push({ kind: "dish", slug: d.slug });
    }
    for (const a of data.addOns) {
      if (effectiveStatus(a) === "new") items.push({ kind: "addon", slug: a.slug });
    }
    return items;
  }, [data]);

  useEffect(() => {
    if (tab === "new" && newItems.length) {
      setSelected(new Set(newItems.map((i) => `${i.kind}:${i.slug}`)));
    } else {
      setSelected(new Set());
    }
  }, [tab, newItems]);

  const itemKey = (item: SelectableItem) => `${item.kind}:${item.slug}`;

  async function setStatus(items: SelectableItem[], status: RecipeStatus) {
    const res = await fetch("/api/recipes/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, status }),
    });
    if (res.ok) {
      setModalItem(null);
      await load();
    }
  }

  async function activateSelected() {
    const items = newItems.filter((i) => selected.has(itemKey(i)));
    if (!items.length) return;
    setActivating(true);
    await setStatus(items, "active");
    setActivating(false);
  }

  async function retireItem(item: SelectableItem) {
    await setStatus([item], "inactive");
  }

  async function acceptItem(item: SelectableItem) {
    setStatusUpdating(itemKey(item));
    await setStatus([item], "active");
    setStatusUpdating(null);
  }

  async function rejectItem(item: SelectableItem) {
    setStatusUpdating(itemKey(item));
    await setStatus([item], "inactive");
    setStatusUpdating(null);
  }

  async function reviveItem(item: SelectableItem) {
    setStatusUpdating(itemKey(item));
    await setStatus([item], "active");
    setStatusUpdating(null);
  }

  function renderDishTile(dish: DishRecipe) {
    const key = `dish:${dish.slug}`;
    return (
      <div className="relative">
        {tab === "new" && (
          <input
            type="checkbox"
            checked={selected.has(key)}
            onChange={(event) => {
              event.stopPropagation();
              setSelected((prev) => {
                const next = new Set(prev);
                if (event.target.checked) next.add(key);
                else next.delete(key);
                return next;
              });
            }}
            onClick={(event) => event.stopPropagation()}
            className="absolute left-2 top-2 z-10 h-4 w-4 accent-chef-sage"
            aria-label={`Select ${dish.name}`}
          />
        )}
        <RecipeTile
          name={displayRecipeName(dish.name, tab)}
          imageUrl={dish.imageUrl}
          selected={selected.has(key)}
          inProgress={recipeInProgress(dish.recipe)}
          onClick={() => setModalItem(dishToModalItem(dish, tab))}
        />
      </div>
    );
  }

  function renderAddOnTile(addOn: AddOnRecipe) {
    const key = `addon:${addOn.slug}`;
    return (
      <div className="relative">
        {tab === "new" && (
          <input
            type="checkbox"
            checked={selected.has(key)}
            onChange={(event) => {
              event.stopPropagation();
              setSelected((prev) => {
                const next = new Set(prev);
                if (event.target.checked) next.add(key);
                else next.delete(key);
                return next;
              });
            }}
            onClick={(event) => event.stopPropagation()}
            className="absolute left-2 top-2 z-10 h-4 w-4 accent-chef-sage"
            aria-label={`Select ${addOn.name}`}
          />
        )}
        <RecipeTile
          name={displayRecipeName(addOn.name, tab)}
          inProgress={recipeInProgress(addOn.recipe)}
          selected={selected.has(key)}
          onClick={() => setModalItem(addOnToModalItem(addOn, tab))}
        />
      </div>
    );
  }

  if (loading && !data) {
    return (
      <>
        <Nav />
        <p className="p-8 text-chef-text-muted">Loading recipes…</p>
      </>
    );
  }

  const counts = data?.counts ?? {
    dishes: 0,
    dishesWithRecipes: 0,
    addOns: 0,
    new: 0,
    active: 0,
    inactive: 0,
    suggested: 0,
  };
  const empty = counts.dishes === 0 && counts.addOns === 0;
  const tabCount = (id: StatusTab) => counts[id];
  const modalKey = modalItem ? `${modalItem.kind}:${modalItem.slug}` : null;

  return (
    <>
      <Nav />
      <main className="sc-main-with-nav mx-auto max-w-6xl px-4 pb-8">
        <h1 className="text-2xl font-semibold text-chef-text sm:text-3xl">Recipes</h1>
        <p className="mt-2 text-base text-chef-text-muted">View and Manage Recipes</p>

        {recipeAgentCooking && (
          <div
            className="mt-6 flex items-center gap-3 rounded-xl border border-chef-sage/40 bg-chef-sage/10 px-4 py-4"
            role="status"
            aria-live="polite"
          >
            <span className="text-2xl" aria-hidden>
              👨‍🍳
            </span>
            <div>
              <p className="font-semibold text-chef-text">Recipe Agent is Cooking!!</p>
              <p className="mt-0.5 text-sm text-chef-text-muted">
                Linking dishes to pantry, computing food cost, and assigning sell prices with
                margin.
              </p>
            </div>
            <span className="ml-auto h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-chef-sage border-t-transparent" />
          </div>
        )}

        {(data?.inProgress?.length ?? 0) > 0 && (
          <div className="mt-4 space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-chef-text-muted">
              In progress
            </h2>
            {data!.inProgress!.map((item) => (
              <div
                key={`${item.kind}:${item.slug}`}
                className="flex items-center gap-3 rounded-lg border border-chef-border bg-chef-muted/40 px-4 py-3 text-sm"
              >
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-chef-sage border-t-transparent" />
                <span className="font-medium text-chef-text">
                  Recipe #{item.recipeNumber} — {item.name}
                </span>
                <span className="text-chef-text-muted">
                  {item.progressMessage ??
                    (item.progress === "linking" ? "Linking ingredients…" : "Pricing recipe…")}
                </span>
              </div>
            ))}
          </div>
        )}

        {empty ? (
          <div className="mt-6">
            <CatalogEmptyPrompt
              title="No dishes yet"
              description="Upload sales orders to capture dishes, then purchase orders to stock ingredients and build recipes."
            />
            <p className="mt-4 text-sm text-chef-text-muted">
              <Link href="/upload-orders" className="text-chef-sage underline">
                Go to Upload orders
              </Link>
            </p>
          </div>
        ) : (
          <>
            <div
              className="mt-6 flex flex-wrap gap-2 border-b border-chef-border pb-3"
              role="tablist"
              aria-label="Recipe status"
            >
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    tab === t.id
                      ? "bg-chef-sage text-white"
                      : "bg-chef-muted text-chef-text-muted hover:text-chef-text"
                  }`}
                >
                  {t.label}
                  {tabCount(t.id) > 0 ? ` (${tabCount(t.id)})` : ""}
                </button>
              ))}
            </div>

            {(tab === "active" || tab === "inactive") && (
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <label className="block w-full sm:min-w-[12rem] sm:flex-1 sm:max-w-md">
                  <span className="sr-only">Search for Recipe</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search for Recipe"
                    className="w-full rounded-lg border border-chef-muted bg-white px-3 py-2 text-sm text-chef-text"
                  />
                </label>
                <PantryMultiSelectFilter
                  label="Dish class"
                  placeholder="All classes"
                  options={classFilterOptions}
                  selected={classFilters}
                  onChange={setClassFilters}
                  className="w-full sm:w-44"
                />
              </div>
            )}

            {tab === "new" && newItems.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-chef-border bg-chef-muted/40 px-4 py-3">
                <p className="text-sm text-chef-text">
                  {selected.size} of {newItems.length} new recipe
                  {newItems.length === 1 ? "" : "s"} selected
                </p>
                <button
                  type="button"
                  disabled={activating || selected.size === 0}
                  onClick={() => void activateSelected()}
                  className="rounded-lg bg-chef-sage px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {activating ? "Activating…" : "Activate selected"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSelected(
                      selected.size === newItems.length
                        ? new Set()
                        : new Set(newItems.map(itemKey))
                    )
                  }
                  className="text-sm text-chef-sage underline"
                >
                  {selected.size === newItems.length ? "Clear all" : "Select all"}
                </button>
              </div>
            )}

            {filteredDishes.length === 0 && filteredAddOns.length === 0 ? (
              <p className="mt-6 text-sm text-chef-text-muted">
                No {tab} recipes
                {(tab === "active" || tab === "inactive") &&
                (search.trim() || classFilters.length > 0)
                  ? " match your filters"
                  : ""}
                .
              </p>
            ) : (
              <div className="mt-6 space-y-8">
                {filteredDishes.length > 0 && (
                  <section>
                    <h2 className="text-lg font-semibold text-chef-text">Dishes</h2>
                    <p className="mt-1 text-sm text-chef-text-muted">
                      Grouped by dish class. Click a card for full recipe details.
                    </p>
                    <div className="mt-4">
                      <KitchenClassifiedGrid
                        groups={dishGroups}
                        emptyMessage={`No ${tab} dishes${
                          (tab === "active" || tab === "inactive") &&
                          (search.trim() || classFilters.length > 0)
                            ? " match your filters"
                            : ""
                        }.`}
                        itemLabel={(count) => `${count} dish${count === 1 ? "" : "es"}`}
                        renderItem={renderDishTile}
                      />
                    </div>
                  </section>
                )}

                {filteredAddOns.length > 0 && (
                  <section>
                    <h2 className="text-lg font-semibold text-chef-text">Add-ons</h2>
                    <p className="mt-1 text-sm text-chef-text-muted">
                      Grouped by add-on class. Click a card for full recipe details.
                    </p>
                    <div className="mt-4">
                      <KitchenClassifiedGrid
                        groups={addOnGroups}
                        emptyMessage={`No ${tab} add-ons${
                          (tab === "active" || tab === "inactive") &&
                          (search.trim() || classFilters.length > 0)
                            ? " match your filters"
                            : ""
                        }.`}
                        itemLabel={(count) => `${count} add-on${count === 1 ? "" : "s"}`}
                        renderItem={renderAddOnTile}
                      />
                    </div>
                  </section>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {modalItem && (
        <RecipeDetailModal
          item={modalItem}
          tab={tab}
          showCheckbox={tab === "new"}
          selected={modalKey ? selected.has(modalKey) : false}
          onSelect={(value) => {
            if (!modalKey) return;
            setSelected((prev) => {
              const next = new Set(prev);
              if (value) next.add(modalKey);
              else next.delete(modalKey);
              return next;
            });
          }}
          onClose={() => setModalItem(null)}
          onRetire={() =>
            void retireItem({ kind: modalItem.kind, slug: modalItem.slug })
          }
          onAccept={() =>
            void acceptItem({ kind: modalItem.kind, slug: modalItem.slug })
          }
          onReject={() =>
            void rejectItem({ kind: modalItem.kind, slug: modalItem.slug })
          }
          onRevive={() =>
            void reviveItem({ kind: modalItem.kind, slug: modalItem.slug })
          }
          actionBusy={modalKey ? statusUpdating === modalKey : false}
        />
      )}
    </>
  );
}
