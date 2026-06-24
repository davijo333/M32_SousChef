"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CreateChefChat } from "@/components/CreateChefChat";
import { DashboardChefChat } from "@/components/DashboardChefChat";
import { MarginRankingChart } from "@/components/MarginRankingChart";
import { Nav } from "@/components/Nav";
import { PantryMultiSelectFilter } from "@/components/PantryMultiSelectFilter";
import { useKitchenName } from "@/components/KitchenNameProvider";
import type { MarginDishRow } from "@/lib/dashboard-margins";
import { formatPercent, MARGIN_RANKING_LIMIT } from "@/lib/dashboard-margins";
import {
  filterByClassKeys,
  SALES_RANKING_LIMIT,
  type ExpiryRankingRow,
  type ReorderRankingRow,
  type SalesRankingRow,
} from "@/lib/dashboard-sales-analytics";
import type { FinancePeriodPoint, FinanceSummary } from "@/lib/dashboard-stats";
import { formatCurrency } from "@/lib/dashboard-stats";
import { loadTestDataAndNotify, TEST_DATA_LOADED_EVENT } from "@/lib/load-test-data";

type DashboardSection = "inventory" | "business" | "create";
type BusinessTab = "sales" | "margins";
type MarginView = "highest" | "lowest";
type SalesInsightView = "topSelling" | "topUsed" | "expiry" | "reorder";

const SALES_INSIGHT_OPTIONS: Array<{ id: SalesInsightView; label: string }> = [
  { id: "topSelling", label: "Top selling dishes" },
  { id: "topUsed", label: "Top used ingredients" },
  { id: "expiry", label: "Approaching expiry" },
  { id: "reorder", label: "Approaching reorder" },
];

type DashboardData = {
  restaurant: { name: string; isSeeded: boolean };
  dishes: {
    total: number;
    active: number;
    suggested: number;
  };
  ingredients: {
    total: number;
    required: number;
    expiring: number;
  };
  finance: {
    view: "week" | "month";
    periods: FinancePeriodPoint[];
    summary: FinanceSummary;
  };
  expiring: Array<{ name: string; currentQty: number; inventoryUnit: string; expiryDate: string }>;
  lowStock: Array<{
    name: string;
    currentQty: number;
    reorderThreshold: number;
    inventoryUnit: string;
  }>;
  margins: {
    dishes: {
      highest: MarginDishRow[];
      lowest: MarginDishRow[];
    };
  };
  salesAnalytics: {
    dishClasses: Array<{ value: string; label: string }>;
    ingredientClasses: Array<{ value: string; label: string }>;
    topSellingDishes: SalesRankingRow[];
    topUsedIngredients: SalesRankingRow[];
    approachingExpiry: ExpiryRankingRow[];
    approachingReorder: ReorderRankingRow[];
  };
};

function StatCard({
  label,
  value,
  detail,
  items,
}: {
  label: string;
  value: number | string;
  detail?: string;
  items?: string[];
}) {
  return (
    <div className="sc-card p-4">
      <p className="text-sm text-chef-text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-chef-text">{value}</p>
      {detail ? <p className="mt-1 text-xs text-chef-text-muted">{detail}</p> : null}
      {items && items.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-chef-text-muted">
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      ) : items ? (
        <p className="mt-3 text-xs text-chef-text-muted">None right now.</p>
      ) : null}
    </div>
  );
}

function sectionTabClass(active: boolean): string {
  return `rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
    active
      ? "bg-chef-sage text-white"
      : "bg-chef-muted text-chef-text-muted hover:text-chef-text"
  }`;
}

function businessTabClass(active: boolean): string {
  return `rounded-md px-3 py-1.5 ${
    active ? "bg-chef-sage text-white" : "text-chef-text-muted hover:text-chef-text"
  }`;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`mt-0.5 h-5 w-5 shrink-0 text-chef-text-muted transition-transform duration-200 ${
        open ? "rotate-90" : ""
      }`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function CollapsibleSection({
  title,
  description,
  open,
  onToggle,
  actions,
  children,
  className = "",
}: {
  title: string;
  description?: ReactNode;
  open: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-2 rounded-lg text-left hover:opacity-90"
        >
          <ChevronIcon open={open} />
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-chef-text">{title}</h3>
            {description ? (
              <div className="mt-1 text-sm text-chef-text-muted">{description}</div>
            ) : null}
          </div>
        </button>
        {actions}
      </div>
      {open ? children : null}
    </section>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, update: updateSession } = useSession();
  const { refreshRestaurant } = useKitchenName();
  const [data, setData] = useState<DashboardData | null>(null);
  const [section, setSection] = useState<DashboardSection>("inventory");
  const [businessTab, setBusinessTab] = useState<BusinessTab>("sales");
  const [financeView, setFinanceView] = useState<"week" | "month">("week");
  const [marginView, setMarginView] = useState<MarginView>("highest");
  const [salesInsightView, setSalesInsightView] = useState<SalesInsightView>("topSelling");
  const [salesPurchasesOpen, setSalesPurchasesOpen] = useState(true);
  const [kitchenInsightsOpen, setKitchenInsightsOpen] = useState(true);
  const [dishClassFilters, setDishClassFilters] = useState<string[]>([]);
  const [ingredientClassFilters, setIngredientClassFilters] = useState<string[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState("");
  const [seedMessage, setSeedMessage] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/dashboard?financeView=${financeView}`);
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (!res.ok) return;
    setData(await res.json());
  }, [router, financeView]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const refresh = () => {
      void load();
    };
    window.addEventListener(TEST_DATA_LOADED_EVENT, refresh);
    return () => window.removeEventListener(TEST_DATA_LOADED_EVENT, refresh);
  }, [load]);

  const filteredSalesCharts = useMemo(() => {
    if (!data?.salesAnalytics) {
      return {
        topSellingDishes: [],
        topUsedIngredients: [],
        approachingExpiry: [],
        approachingReorder: [],
      };
    }
    const analytics = data.salesAnalytics;
    return {
      topSellingDishes: filterByClassKeys(analytics.topSellingDishes, dishClassFilters),
      topUsedIngredients: filterByClassKeys(analytics.topUsedIngredients, ingredientClassFilters),
      approachingExpiry: filterByClassKeys(analytics.approachingExpiry, ingredientClassFilters),
      approachingReorder: filterByClassKeys(analytics.approachingReorder, ingredientClassFilters),
    };
  }, [data, dishClassFilters, ingredientClassFilters]);

  async function loadDemo() {
    setSeeding(true);
    setSeedError("");
    setSeedMessage("");
    try {
      const result = await loadTestDataAndNotify();
      if (!result.ok) {
        setSeedError(result.error ?? "Could not load test data.");
        return;
      }
      setSeedMessage(result.message ?? "Test data loaded.");
      await updateSession({
        restaurantName: result.restaurant ?? "Panera Cafe",
        kitchenNameSet: true,
      });
      await refreshRestaurant();
      await load();
    } catch {
      setSeedError("Network error — try again.");
    } finally {
      setSeeding(false);
    }
  }

  if (!data) {
    return (
      <>
        <Nav />
        <p className="p-8 text-chef-text-muted">Loading dashboard…</p>
      </>
    );
  }

  const chefName = session?.user?.name ?? "Chef";
  const empty = data.ingredients.total === 0;
  const showDemoLoad = empty || !data.restaurant.isSeeded;
  const financeSummary = data.finance.summary;
  const periodLabel = financeView === "week" ? "past 5 weeks" : "past 2 months";
  const salesFiltersActive = dishClassFilters.length > 0 || ingredientClassFilters.length > 0;

  return (
    <>
      <Nav />
      <main className="sc-main-with-nav mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-chef-text">Good morning, Chef {chefName}</h1>
          </div>
          <button
            type="button"
            onClick={() => void loadDemo()}
            disabled={seeding}
            className="relative z-10 shrink-0 cursor-pointer rounded-xl bg-chef-sage px-4 py-2 text-sm font-semibold text-white transition hover:bg-chef-sage-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {seeding ? "Loading test data…" : "Load test data"}
          </button>
        </div>

        {seedError && <p className="mt-3 text-sm text-red-600">{seedError}</p>}
        {seedMessage && !seedError && (
          <p className="mt-3 text-sm text-chef-sage">{seedMessage}</p>
        )}

        {showDemoLoad && (
          <div className="mt-6 rounded-xl border border-chef-amber/40 bg-chef-amber-light/50 p-6">
            <h2 className="font-medium text-chef-text">Get started</h2>
            <p className="mt-1 text-chef-text-muted">
              Load the Panera Cafe demo menu, pantry, and order history with{" "}
              <button
                type="button"
                onClick={() => void loadDemo()}
                disabled={seeding}
                className="font-medium text-chef-sage underline hover:text-chef-sage-dark disabled:opacity-50"
              >
                Load test data
              </button>
              , or upload purchase orders to build from bills.
            </p>
            <div className="mt-4">
              <Link
                href="/upload-orders"
                className="inline-block rounded-lg border border-chef-border px-4 py-2 text-sm text-chef-text hover:bg-chef-muted"
              >
                Upload purchase orders
              </Link>
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Dashboard sections">
          <button
            type="button"
            role="tab"
            aria-selected={section === "inventory"}
            onClick={() => setSection("inventory")}
            className={sectionTabClass(section === "inventory")}
          >
            Inventory
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === "business"}
            onClick={() => setSection("business")}
            className={sectionTabClass(section === "business")}
          >
            Business
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === "create"}
            onClick={() => setSection("create")}
            className={sectionTabClass(section === "create")}
          >
            Create
          </button>
        </div>

        {section === "inventory" && (
          <>
            <section className="mt-6">
              <h2 className="text-lg font-semibold text-chef-text">Dishes</h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <StatCard label="Total dishes" value={data.dishes.total} />
                <StatCard label="Active dishes" value={data.dishes.active} />
                <StatCard label="New suggestions" value={data.dishes.suggested} />
              </div>
            </section>

            <section className="mt-8">
              <h2 className="text-lg font-semibold text-chef-text">Ingredients</h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <StatCard label="Total ingredients" value={data.ingredients.total} />
                <StatCard
                  label="Required / low stock"
                  value={data.ingredients.required}
                  items={data.lowStock.map(
                    (item) =>
                      `${item.name} — ${item.currentQty} ${item.inventoryUnit} (reorder at ${item.reorderThreshold})`
                  )}
                />
                <StatCard
                  label="Expiring within 7 days"
                  value={data.ingredients.expiring}
                  items={data.expiring.map(
                    (item) => `${item.name} — ${item.currentQty} ${item.inventoryUnit}`
                  )}
                />
              </div>
            </section>

            <section className="mt-8">
              <h2 className="text-lg font-semibold text-chef-text">Inventory Assistant</h2>
              <p className="mt-1 text-sm text-chef-text-muted">
                Pantry stock, expiry, and reorder.
              </p>
              <div className="mt-4">
                <DashboardChefChat context="inventory" />
              </div>
            </section>
          </>
        )}

        {section === "business" && (
          <div className="mt-6 rounded-2xl border border-chef-border bg-chef-surface/50 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-chef-text">Business</h2>
              <div className="flex rounded-lg border border-chef-border bg-white p-1 text-sm">
                <button
                  type="button"
                  role="tab"
                  aria-selected={businessTab === "sales"}
                  onClick={() => setBusinessTab("sales")}
                  className={businessTabClass(businessTab === "sales")}
                >
                  Sales
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={businessTab === "margins"}
                  onClick={() => setBusinessTab("margins")}
                  className={businessTabClass(businessTab === "margins")}
                >
                  Margins
                </button>
              </div>
            </div>

            {businessTab === "sales" && (
              <div className="mt-5">
                <CollapsibleSection
                  title="Sales & purchases"
                  description={
                    <>
                      POS sales vs wholesale supplier bills for the {periodLabel}. Menu margins apply
                      to items sold — supplier bills restock pantry inventory (cases, gallons), not
                      per-ticket food cost.
                    </>
                  }
                  open={salesPurchasesOpen}
                  onToggle={() => setSalesPurchasesOpen((value) => !value)}
                  actions={
                    <div className="flex rounded-lg border border-chef-border bg-white p-1 text-sm">
                      <button
                        type="button"
                        onClick={() => setFinanceView("week")}
                        className={businessTabClass(financeView === "week")}
                      >
                        Weekly
                      </button>
                      <button
                        type="button"
                        onClick={() => setFinanceView("month")}
                        className={businessTabClass(financeView === "month")}
                      >
                        Monthly
                      </button>
                    </div>
                  }
                >
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                      label={`POS sales (${periodLabel})`}
                      value={formatCurrency(financeSummary.sales)}
                      detail={`${financeSummary.posTickets} tickets · ${financeSummary.itemsSold} items`}
                    />
                    <StatCard
                      label="COGS (items sold)"
                      value={formatCurrency(financeSummary.soldCogs)}
                      detail="Food cost for menu items on those tickets"
                    />
                    <StatCard
                      label="Gross profit"
                      value={formatCurrency(financeSummary.grossProfit)}
                      detail={`${financeSummary.grossMarginPercent.toFixed(1)}% margin on sold items`}
                    />
                    <StatCard
                      label={`Supplier purchases (${periodLabel})`}
                      value={formatCurrency(financeSummary.supplierPurchases)}
                      detail="Bulk inventory restocks — not the same as COGS"
                    />
                  </div>
                </CollapsibleSection>

                <CollapsibleSection
                  className="mt-8"
                  title="Kitchen insights"
                  description={
                    <>
                      Top {SALES_RANKING_LIMIT} for the {periodLabel}. Selling dishes include{" "}
                      <span className="font-medium text-chef-text">active</span> menu items only.
                    </>
                  }
                  open={kitchenInsightsOpen}
                  onToggle={() => setKitchenInsightsOpen((value) => !value)}
                  actions={
                    <div className="flex flex-wrap gap-2">
                      <PantryMultiSelectFilter
                        label="Dish class"
                        placeholder="All dish classes"
                        options={data.salesAnalytics.dishClasses}
                        selected={dishClassFilters}
                        onChange={setDishClassFilters}
                        className="w-full text-sm sm:w-44"
                      />
                      <PantryMultiSelectFilter
                        label="Pantry class"
                        placeholder="All pantry classes"
                        options={data.salesAnalytics.ingredientClasses}
                        selected={ingredientClassFilters}
                        onChange={setIngredientClassFilters}
                        className="w-full text-sm sm:w-44"
                      />
                      {salesFiltersActive && (
                        <button
                          type="button"
                          onClick={() => {
                            setDishClassFilters([]);
                            setIngredientClassFilters([]);
                          }}
                          className="rounded-lg border border-chef-border px-3 py-2 text-sm text-chef-text-muted hover:text-chef-text"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  }
                >
                  <div className="mt-4 flex flex-wrap rounded-lg border border-chef-border bg-white p-1 text-sm">
                    {SALES_INSIGHT_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setSalesInsightView(option.id)}
                        className={businessTabClass(salesInsightView === option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4">
                    {salesInsightView === "topSelling" && (
                      <MarginRankingChart
                        title="Top selling dishes"
                        subtitle="Units sold on POS tickets"
                        emptyMessage="No active dish sales in this period."
                        rows={filteredSalesCharts.topSellingDishes.map((dish) => ({
                          slug: dish.slug,
                          name: dish.name,
                          value: dish.value,
                          label: `${dish.value} sold`,
                        }))}
                      />
                    )}
                    {salesInsightView === "topUsed" && (
                      <MarginRankingChart
                        title="Top used ingredients"
                        subtitle="Usage from sold dishes & add-ons"
                        emptyMessage="No ingredient usage from sales yet."
                        rows={filteredSalesCharts.topUsedIngredients.map((ingredient) => ({
                          slug: ingredient.slug,
                          name: ingredient.name,
                          value: ingredient.value,
                          label: `${ingredient.value} units`,
                        }))}
                        barClassName="bg-chef-sage-dark"
                      />
                    )}
                    {salesInsightView === "expiry" && (
                      <MarginRankingChart
                        title="Approaching expiry"
                        subtitle="Within 7 days"
                        emptyMessage="No ingredients expiring soon."
                        rows={filteredSalesCharts.approachingExpiry.map((ingredient) => ({
                          slug: ingredient.slug,
                          name: ingredient.name,
                          value: ingredient.value,
                          label: `${ingredient.daysLeft}d left · ${ingredient.currentQty} ${ingredient.inventoryUnit}`,
                        }))}
                        barClassName="bg-chef-amber"
                      />
                    )}
                    {salesInsightView === "reorder" && (
                      <MarginRankingChart
                        title="Approaching reorder"
                        subtitle="At or below 150% of reorder threshold"
                        emptyMessage="No ingredients near reorder level."
                        rows={filteredSalesCharts.approachingReorder.map((ingredient) => ({
                          slug: ingredient.slug,
                          name: ingredient.name,
                          value: Math.max(0.05, 1 - ingredient.value),
                          label: `${ingredient.currentQty} ${ingredient.inventoryUnit} (reorder at ${ingredient.reorderThreshold})`,
                        }))}
                        barClassName="bg-red-400"
                      />
                    )}
                  </div>
                </CollapsibleSection>
              </div>
            )}

            {businessTab === "margins" && (
              <div className="mt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-chef-text-muted">
                    Top {MARGIN_RANKING_LIMIT} dishes by dollar margin per serving (from ready recipes).
                  </p>
                  <div className="flex rounded-lg border border-chef-border bg-white p-1 text-sm">
                    <button
                      type="button"
                      onClick={() => setMarginView("highest")}
                      className={businessTabClass(marginView === "highest")}
                    >
                      Highest margin
                    </button>
                    <button
                      type="button"
                      onClick={() => setMarginView("lowest")}
                      className={businessTabClass(marginView === "lowest")}
                    >
                      Lowest margin
                    </button>
                  </div>
                </div>
                <div className="mt-4">
                  <MarginRankingChart
                    title={
                      marginView === "highest"
                        ? `Top ${MARGIN_RANKING_LIMIT} — highest margin dishes`
                        : `Top ${MARGIN_RANKING_LIMIT} — lowest margin dishes`
                    }
                    subtitle="Dollar margin per serving"
                    emptyMessage="No priced dish recipes yet."
                    rows={(marginView === "highest"
                      ? data.margins.dishes.highest
                      : data.margins.dishes.lowest
                    ).map((dish) => ({
                      slug: dish.slug,
                      name: dish.name,
                      value: dish.marginDollars,
                      label: `${formatCurrency(dish.marginDollars)} (${formatPercent(dish.marginPercent)})`,
                    }))}
                    barClassName={marginView === "highest" ? "bg-chef-sage" : "bg-chef-amber"}
                  />
                </div>
              </div>
            )}

            <div className="mt-8 border-t border-chef-border pt-6">
              <h3 className="text-base font-semibold text-chef-text">Business Assistant</h3>
              <p className="mt-1 text-sm text-chef-text-muted">
                Sales, margins, and purchases for the {periodLabel}.
              </p>
              <div className="mt-4">
                <DashboardChefChat context="business" financeView={financeView} />
              </div>
            </div>
          </div>
        )}

        {section === "create" && (
          <section className="mt-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-chef-text">Creative Assistant</h2>
              <p className="mt-1 text-sm text-chef-text-muted">
                Brainstorm specials from today&apos;s cues — say{" "}
                <span className="font-medium text-chef-text">add it</span> to save to Suggested.
              </p>
            </div>
            <CreateChefChat />
          </section>
        )}
      </main>
    </>
  );
}
