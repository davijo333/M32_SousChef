"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CatalogEmptyPrompt } from "@/components/CatalogEmptyPrompt";
import { Nav } from "@/components/Nav";

type RecipeStatus = "new" | "active" | "inactive" | "suggested";
type StatusTab = RecipeStatus;

type RecipeLink = {
  ingredientSlug: string;
  ingredientName: string;
  imageUrl?: string;
  qtyPerServing: number;
  unit: string;
  scalesWithSize?: boolean;
  notes?: string;
  inPantry: boolean;
};

type RecipeMeta = {
  recipeNumber: number;
  servingQty: number;
  foodCost: number;
  margin: number;
  sellPrice: number;
  progress: "linking" | "pricing" | "ready" | "failed";
  progressMessage?: string;
  ingredients: Array<{
    ingredientSlug: string;
    ingredientName: string;
    qtyUsed: number;
    unit: string;
  }>;
};

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

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

function classificationLabel(c: string): string {
  if (c === "addon") return "Add-on";
  if (c === "sandwich") return "Sandwich";
  if (c === "beverage" || c === "coffee" || c === "tea" || c === "juice") {
    return c.charAt(0).toUpperCase() + c.slice(1);
  }
  return c.replace(/_/g, " ");
}

function effectiveStatus(item: { hasRecipe: boolean; recipeStatus?: RecipeStatus }): RecipeStatus | undefined {
  if (!item.hasRecipe) return undefined;
  return item.recipeStatus ?? "new";
}

function RecipeLinkList({ links }: { links: RecipeLink[] }) {
  if (!links.length) {
    return (
      <p className="mt-3 text-sm text-chef-text-muted">
        No ingredients linked yet. Process a purchase order after uploading sales orders to
        auto-generate recipes.
      </p>
    );
  }

  return (
    <ul className="mt-3 space-y-1.5">
      {links.map((link) => (
        <li
          key={link.ingredientSlug}
          className="flex items-center gap-2 rounded-lg bg-chef-muted/60 px-3 py-2 text-sm text-chef-text"
        >
          {link.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={link.imageUrl}
              alt=""
              className="h-8 w-8 shrink-0 rounded-md object-cover"
            />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-chef-muted text-xs text-chef-text-muted">
              🥬
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="font-medium">{link.ingredientName}</span>
            <span className="text-chef-text-muted">
              {" "}
              — {link.qtyPerServing} {link.unit}
              {link.scalesWithSize === false ? " (fixed)" : ""}
            </span>
            {!link.inPantry && (
              <span className="ml-1 text-xs font-semibold uppercase text-chef-amber">missing</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RecipeCard({
  title,
  subtitle,
  imageUrl,
  links,
  recipe,
  selected,
  onSelect,
  showCheckbox,
  onRetire,
  showRetire,
}: {
  title: string;
  subtitle: string;
  imageUrl?: string;
  links: RecipeLink[];
  recipe?: RecipeMeta;
  selected?: boolean;
  onSelect?: (v: boolean) => void;
  showCheckbox?: boolean;
  onRetire?: () => void;
  showRetire?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const inProgress = recipe && recipe.progress !== "ready" && recipe.progress !== "failed";

  return (
    <article className={`sc-card overflow-hidden ${inProgress ? "ring-2 ring-chef-sage/40" : ""}`}>
      <div className="flex items-start gap-3 p-5">
        {showCheckbox && onSelect && (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            className="mt-5 h-4 w-4 shrink-0 accent-chef-sage"
            aria-label={`Select ${title}`}
          />
        )}
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-xl border border-chef-border object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-chef-border bg-chef-muted text-2xl text-chef-text-muted/50">
            🍽
          </span>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="min-w-0 flex-1 text-left"
        >
          <h2 className="font-semibold text-chef-text">{title}</h2>
          <p className="mt-1 text-sm text-chef-text-muted">{subtitle}</p>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="text-chef-text-muted" aria-hidden>
            {expanded ? "▾" : "▸"}
          </span>
          {showRetire && onRetire && (
            <button
              type="button"
              onClick={onRetire}
              className="text-xs text-chef-text-muted underline hover:text-chef-text"
            >
              Retire
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="border-t border-chef-border px-5 pb-5">
          {recipe && (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs uppercase text-chef-text-muted">Recipe #</dt>
                <dd className="font-medium text-chef-text">{recipe.recipeNumber}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-chef-text-muted">Qty / serving</dt>
                <dd className="font-medium text-chef-text">{recipe.servingQty}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-chef-text-muted">Food cost</dt>
                <dd className="font-medium text-chef-text">{formatMoney(recipe.foodCost)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-chef-text-muted">Margin</dt>
                <dd className="font-medium text-chef-text">{(recipe.margin * 100).toFixed(0)}%</dd>
              </div>
            </dl>
          )}
          {inProgress && (
            <p className="mt-3 flex items-center gap-2 text-sm text-chef-sage">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-chef-sage border-t-transparent" />
              {recipe?.progressMessage ??
                (recipe?.progress === "linking"
                  ? "Linking ingredients…"
                  : "Computing cost and sell price…")}
            </p>
          )}
          <p className="pt-3 text-xs font-medium uppercase tracking-wide text-chef-text-muted">
            Ingredients linked
          </p>
          <RecipeLinkList links={recipe?.ingredients?.length
            ? recipe.ingredients.map((ing) => ({
                ingredientSlug: ing.ingredientSlug,
                ingredientName: ing.ingredientName,
                qtyPerServing: ing.qtyUsed,
                unit: ing.unit,
                inPantry: links.some((l) => l.ingredientSlug === ing.ingredientSlug && l.inPantry),
              }))
            : links} />
        </div>
      )}
    </article>
  );
}

export default function RecipesPage() {
  const router = useRouter();
  const [data, setData] = useState<RecipesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<StatusTab>("new");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activating, setActivating] = useState(false);
  const [recipeAgentCooking, setRecipeAgentCooking] = useState(false);

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

  const matchesSearch = useCallback(
    (name: string, links: RecipeLink[]) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        name.toLowerCase().includes(q) ||
        links.some((l) => l.ingredientName.toLowerCase().includes(q))
      );
    },
    [search]
  );

  const filteredDishes = useMemo(() => {
    const dishes = data?.dishes ?? [];
    return dishes.filter((d) => {
      const status = effectiveStatus(d);
      if (status !== tab) return false;
      return matchesSearch(d.name, d.ingredientLinks);
    });
  }, [data?.dishes, tab, matchesSearch]);

  const filteredAddOns = useMemo(() => {
    const addOns = data?.addOns ?? [];
    return addOns.filter((a) => {
      const status = effectiveStatus(a);
      if (status !== tab) return false;
      return matchesSearch(a.name, a.ingredientLinks);
    });
  }, [data?.addOns, tab, matchesSearch]);

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
    if (res.ok) await load();
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

  return (
    <>
      <Nav />
      <main className="sc-main-with-nav mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-chef-text sm:text-3xl">Recipes</h1>
        <p className="mt-2 text-base text-chef-text-muted">
          Recipe Agent adds linked ingredients as <strong>New</strong>. Review and activate for
          production, or retire dishes off the menu. <strong>Suggested</strong> includes agent
          proposals—even for inactive items.
        </p>

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

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-chef-text-muted">
                {counts.dishesWithRecipes} of {counts.dishes} dishes have recipes
                {counts.addOns > 0 ? ` · ${counts.addOns} add-on${counts.addOns === 1 ? "" : "s"}` : ""}
              </p>
              <label className="block w-full sm:max-w-xs">
                <span className="sr-only">Search dishes or ingredients</span>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search dish or ingredient…"
                  className="w-full rounded-lg border border-chef-muted bg-white px-3 py-2 text-sm text-chef-text"
                />
              </label>
            </div>

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

            {tab === "suggested" && (
              <p className="mt-4 text-sm text-chef-text-muted">
                Agent suggestions may reference retired (inactive) dishes when proposing menu
                changes.
              </p>
            )}

            {filteredDishes.length === 0 && filteredAddOns.length === 0 ? (
              <p className="mt-6 text-sm text-chef-text-muted">
                No {tab} recipes{search.trim() ? " match your search" : ""}.
              </p>
            ) : (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {filteredDishes.map((dish) => (
                  <RecipeCard
                    key={dish.slug}
                    title={dish.name}
                    imageUrl={dish.imageUrl}
                    subtitle={`${formatMoney(dish.recipe?.sellPrice ?? dish.sellPrice)} · ${classificationLabel(dish.classification)} · ${dish.ingredientLinks.length} ingredient${dish.ingredientLinks.length === 1 ? "" : "s"}${dish.recipe ? ` · #${dish.recipe.recipeNumber}` : ""}`}
                    links={dish.ingredientLinks}
                    recipe={dish.recipe}
                    showCheckbox={tab === "new"}
                    selected={selected.has(`dish:${dish.slug}`)}
                    onSelect={(v) => {
                      const key = `dish:${dish.slug}`;
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (v) next.add(key);
                        else next.delete(key);
                        return next;
                      });
                    }}
                    showRetire={tab === "active"}
                    onRetire={() => void retireItem({ kind: "dish", slug: dish.slug })}
                  />
                ))}
                {filteredAddOns.map((addOn) => (
                  <RecipeCard
                    key={addOn.slug}
                    title={addOn.name}
                    subtitle={`${formatMoney(addOn.recipe?.sellPrice ?? addOn.sellPrice)} · Add-on${addOn.linkedDishNames.length ? ` · for ${addOn.linkedDishNames.join(", ")}` : ""}${addOn.recipe ? ` · #${addOn.recipe.recipeNumber}` : ""}`}
                    links={addOn.ingredientLinks}
                    recipe={addOn.recipe}
                    showCheckbox={tab === "new"}
                    selected={selected.has(`addon:${addOn.slug}`)}
                    onSelect={(v) => {
                      const key = `addon:${addOn.slug}`;
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (v) next.add(key);
                        else next.delete(key);
                        return next;
                      });
                    }}
                    showRetire={tab === "active"}
                    onRetire={() => void retireItem({ kind: "addon", slug: addOn.slug })}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
