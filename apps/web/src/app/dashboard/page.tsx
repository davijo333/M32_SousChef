"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { AgentBrandMark } from "@/components/BrandMark";
import { CreativeCuesPanel } from "@/components/CreativeCuesPanel";
import { SousChefChatDock } from "@/components/SousChefChatDock";
import { KitchenInsightChart } from "@/components/KitchenInsightChart";
import { Nav } from "@/components/Nav";
import { PantryMultiSelectFilter } from "@/components/PantryMultiSelectFilter";
import { SectionInfo } from "@/components/ui/SectionInfo";
import { Tooltip } from "@/components/ui/Tooltip";
import { useKitchenName } from "@/components/KitchenNameProvider";
import { agentBrandLabel, type AgentBrandAgent } from "@/lib/agent-icons";
import type { MarginDishRow } from "@backend/services/dashboard/dashboard-margins";
import { MARGIN_RANKING_LIMIT } from "@backend/services/dashboard/dashboard-margins";
import {
  filterByClassKeys,
  type ExpiryRankingRow,
  type ReorderRankingRow,
  type SalesRankingRow,
} from "@backend/services/dashboard/dashboard-sales-analytics";
import type { FinancePeriodPoint, FinanceSummary } from "@backend/services/dashboard/dashboard-stats";
import {
  financePeriodRange,
  formatCurrency,
  type DashboardFinancePeriod,
} from "@backend/services/dashboard/dashboard-stats";
import { loadTestDataAndNotify, TEST_DATA_LOADED_EVENT } from "@/lib/load-test-data";

type DashboardSection = "inventory" | "business" | "create";
type KitchenInsightView =
  | "topSelling"
  | "topUsed"
  | "expiry"
  | "reorder"
  | "marginPerDish";

const FINANCE_PERIOD_OPTIONS: Array<{
  id: DashboardFinancePeriod;
  label: string;
  hint: string;
}> = [
  { id: "week", label: "Weekly", hint: "Past 7 days through today" },
  { id: "biweek", label: "Bi-weekly", hint: "Past 14 days through today" },
  { id: "month", label: "Monthly", hint: "Current calendar month through today" },
  { id: "quarter", label: "Quarterly", hint: "Current calendar quarter through today" },
];

const KITCHEN_INSIGHTS_PERIOD_LABEL = "past 5 weeks";

const DASHBOARD_SECTIONS: Array<{
  id: DashboardSection;
  agent: AgentBrandAgent;
}> = [
  { id: "inventory", agent: "inventory" },
  { id: "business", agent: "business" },
  { id: "create", agent: "create" },
];

const KITCHEN_INSIGHTS_DISPLAY_LIMIT = 10;

const KITCHEN_INSIGHT_HINTS: Record<KitchenInsightView, string> = {
  topSelling: "Unit sales for active menu dishes in the past 5 weeks",
  topUsed: "Ingredients consumed by sold dishes and add-ons",
  expiry: "Pantry items expiring within 7 days",
  reorder: "On-hand minus reorder level — Most shows largest deficits, Least shows smallest gaps",
  marginPerDish: "Dollar margin per serving from ready recipes — use Most or Least",
};

const DISH_KITCHEN_INSIGHT_VIEWS: KitchenInsightView[] = ["topSelling", "marginPerDish"];
const INGREDIENT_KITCHEN_INSIGHT_VIEWS: KitchenInsightView[] = ["topUsed", "expiry", "reorder"];

const KITCHEN_INSIGHT_OPTIONS: Array<{ id: KitchenInsightView; label: string }> = [
  { id: "topSelling", label: "# of Dishes Sold" },
  { id: "topUsed", label: "# of Units Used" },
  { id: "expiry", label: "Expires Soon" },
  { id: "reorder", label: "Reorder Diff" },
  { id: "marginPerDish", label: "Margin per Dish" },
];

type KitchenInsightEntity = "dishes" | "ingredients";

function sortInsightRows<T>(rows: T[], ascending: boolean): T[] {
  return ascending ? [...rows].reverse() : rows;
}

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
    view: DashboardFinancePeriod;
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
    leastSellingDishes: SalesRankingRow[];
    topUsedIngredients: SalesRankingRow[];
    approachingExpiry: ExpiryRankingRow[];
    approachingReorder: ReorderRankingRow[];
    leastReorderDiff: ReorderRankingRow[];
  };
};

function HorizontalItemStrip({ items }: { items: string[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    return () => observer.disconnect();
  }, [items, updateScrollState]);

  function scrollBy(delta: number) {
    scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  }

  return (
    <div className="mt-1.5 flex items-center gap-0.5">
      <Tooltip content="Scroll left">
        <button
          type="button"
          onClick={() => scrollBy(-160)}
          disabled={!canScrollLeft}
          aria-label="Scroll expiring items left"
          className="sc-icon-btn h-7 w-7 shrink-0 rounded-md disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
      </Tooltip>
      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        className="sc-scrollbar-hide flex min-w-0 flex-1 gap-1.5 overflow-x-auto scroll-smooth py-0.5"
      >
        {items.map((item, index) => (
          <span
            key={`${item}-${index}`}
            title={item}
            className="shrink-0 rounded-md border border-chef-border bg-chef-muted/60 px-2 py-1 text-xs leading-snug text-chef-text"
          >
            {item}
          </span>
        ))}
      </div>
      <Tooltip content="Scroll right">
        <button
          type="button"
          onClick={() => scrollBy(160)}
          disabled={!canScrollRight}
          aria-label="Scroll expiring items right"
          className="sc-icon-btn h-7 w-7 shrink-0 rounded-md disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </Tooltip>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  items,
  labelHint,
  maxItems = 3,
  horizontalItems = false,
}: {
  label: string;
  value: number | string;
  detail?: string;
  items?: string[];
  labelHint?: string;
  maxItems?: number;
  horizontalItems?: boolean;
}) {
  const labelNode = (
    <p className="text-sm font-medium text-chef-text-muted">{label}</p>
  );
  const visibleItems = items?.slice(0, maxItems) ?? [];
  const hiddenCount =
    items && items.length > maxItems ? items.length - maxItems : 0;

  return (
    <div className="sc-card flex h-full flex-col p-3">
      {labelHint ? (
        <Tooltip content={labelHint}>{labelNode}</Tooltip>
      ) : (
        labelNode
      )}
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-chef-text">{value}</p>
      {detail ? (
        <p className="mt-0.5 text-xs leading-snug text-chef-text-muted">{detail}</p>
      ) : null}
      {horizontalItems && items && items.length > 0 ? (
        <HorizontalItemStrip items={items} />
      ) : items && items.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5 text-xs leading-snug text-chef-text-muted">
          {visibleItems.map((item, index) => (
            <li key={index} className="truncate" title={item}>
              {item}
            </li>
          ))}
        </ul>
      ) : items ? (
        <p className="mt-1.5 text-xs text-chef-text-muted">None right now.</p>
      ) : null}
      {!horizontalItems && hiddenCount > 0 ? (
        <p className="mt-1 text-xs font-medium text-chef-sage">+{hiddenCount} more</p>
      ) : null}
    </div>
  );
}

function sectionTabClass(active: boolean): string {
  return `w-full rounded-xl px-2 py-2.5 text-center text-sm font-semibold leading-snug transition-colors sm:px-3 sm:text-base ${
    active
      ? "bg-chef-sage text-white"
      : "bg-chef-muted text-chef-text-muted hover:text-chef-text"
  }`;
}

function businessTabClass(active: boolean): string {
  return `sc-tab-pill ${
    active ? "bg-chef-sage text-white" : "text-chef-text-muted hover:text-chef-text"
  }`;
}

function CollapsibleDashboardCard({
  title,
  infoContent,
  headerControls,
  actions,
  open,
  onToggle,
  children,
  className = "",
}: {
  title: string;
  infoContent?: ReactNode;
  headerControls?: ReactNode;
  actions?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`sc-card overflow-hidden ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="flex min-w-0 items-center gap-2 rounded-lg text-left hover:opacity-90"
          >
            <ChevronRight
              className={`h-5 w-5 shrink-0 text-chef-text-muted transition-transform duration-200 ${
                open ? "rotate-90" : ""
              }`}
              aria-hidden
            />
            <h2 className="text-base font-semibold text-chef-text">{title}</h2>
          </button>
          {infoContent ? <SectionInfo title={title}>{infoContent}</SectionInfo> : null}
          {open ? headerControls : null}
        </div>
        {open ? actions : null}
      </div>
      {open ? (
        <div className="border-t border-chef-border px-3 pb-3 pt-2">{children}</div>
      ) : null}
    </section>
  );
}

function KitchenInsightsInlineToggles({
  entity,
  sortAscending,
  onEntityChange,
  onSortChange,
}: {
  entity: KitchenInsightEntity;
  sortAscending: boolean;
  onEntityChange: (entity: KitchenInsightEntity) => void;
  onSortChange: (ascending: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-xl border border-chef-border bg-white p-0.5">
        <Tooltip content="Dish sales and margin rankings">
          <button
            type="button"
            onClick={() => onEntityChange("dishes")}
            className={`${businessTabClass(entity === "dishes")} px-2.5 py-1 text-xs sm:text-sm`}
          >
            Dishes
          </button>
        </Tooltip>
        <Tooltip content="Ingredient usage, expiry, and reorder">
          <button
            type="button"
            onClick={() => onEntityChange("ingredients")}
            className={`${businessTabClass(entity === "ingredients")} px-2.5 py-1 text-xs sm:text-sm`}
          >
            Ingredients
          </button>
        </Tooltip>
      </div>
      <div className="flex rounded-xl border border-chef-border bg-white p-0.5">
        <Tooltip content="Most">
          <button
            type="button"
            onClick={() => onSortChange(false)}
            aria-label="Most"
            aria-pressed={!sortAscending}
            className={`sc-icon-btn h-8 w-8 p-0 ${!sortAscending ? "bg-chef-sage text-white" : ""}`}
          >
            <ArrowDown className="h-4 w-4" aria-hidden />
          </button>
        </Tooltip>
        <Tooltip content="Least">
          <button
            type="button"
            onClick={() => onSortChange(true)}
            aria-label="Least"
            aria-pressed={sortAscending}
            className={`sc-icon-btn h-8 w-8 p-0 ${sortAscending ? "bg-chef-sage text-white" : ""}`}
          >
            <ArrowUp className="h-4 w-4" aria-hidden />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

function FinancePeriodToggle({
  period,
  onChange,
}: {
  period: DashboardFinancePeriod;
  onChange: (period: DashboardFinancePeriod) => void;
}) {
  return (
    <div className="sc-scrollbar-hide flex max-w-full gap-1 overflow-x-auto rounded-xl border border-chef-border bg-white p-1">
      {FINANCE_PERIOD_OPTIONS.map((option) => (
        <Tooltip key={option.id} content={option.hint}>
          <button
            type="button"
            onClick={() => onChange(option.id)}
            className={`${businessTabClass(period === option.id)} shrink-0`}
          >
            {option.label}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, update: updateSession } = useSession();
  const { refreshRestaurant } = useKitchenName();
  const [data, setData] = useState<DashboardData | null>(null);
  const [section, setSection] = useState<DashboardSection>("inventory");
  const [financePeriod, setFinancePeriod] = useState<DashboardFinancePeriod>("week");
  const [kitchenInsightView, setKitchenInsightView] = useState<KitchenInsightView>("topSelling");
  const [kitchenInsightEntity, setKitchenInsightEntityState] = useState<KitchenInsightEntity>("dishes");
  const [kitchenInsightSortAsc, setKitchenInsightSortAsc] = useState(false);
  const [businessInsightsOpen, setBusinessInsightsOpen] = useState(false);
  const [kitchenInsightsOpen, setKitchenInsightsOpen] = useState(false);
  const [dishClassFilters, setDishClassFilters] = useState<string[]>([]);
  const [ingredientClassFilters, setIngredientClassFilters] = useState<string[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState("");
  const [seedMessage, setSeedMessage] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/dashboard?financeView=${financePeriod}`);
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (!res.ok) return;
    setData(await res.json());
  }, [router, financePeriod]);

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
        leastSellingDishes: [],
        topUsedIngredients: [],
        approachingExpiry: [],
        approachingReorder: [],
        leastReorderDiff: [],
      };
    }
    const analytics = data.salesAnalytics;
    return {
      topSellingDishes: filterByClassKeys(analytics.topSellingDishes, dishClassFilters),
      leastSellingDishes: filterByClassKeys(analytics.leastSellingDishes, dishClassFilters),
      topUsedIngredients: filterByClassKeys(analytics.topUsedIngredients, ingredientClassFilters),
      approachingExpiry: filterByClassKeys(analytics.approachingExpiry, ingredientClassFilters),
      approachingReorder: filterByClassKeys(analytics.approachingReorder, ingredientClassFilters),
      leastReorderDiff: filterByClassKeys(analytics.leastReorderDiff, ingredientClassFilters),
    };
  }, [data, dishClassFilters, ingredientClassFilters]);

  const visibleKitchenInsightOptions = useMemo(
    () =>
      KITCHEN_INSIGHT_OPTIONS.filter((option) =>
        kitchenInsightEntity === "dishes"
          ? DISH_KITCHEN_INSIGHT_VIEWS.includes(option.id)
          : INGREDIENT_KITCHEN_INSIGHT_VIEWS.includes(option.id)
      ),
    [kitchenInsightEntity]
  );

  function handleKitchenInsightEntityChange(next: KitchenInsightEntity) {
    setKitchenInsightEntityState(next);
    const views = next === "dishes" ? DISH_KITCHEN_INSIGHT_VIEWS : INGREDIENT_KITCHEN_INSIGHT_VIEWS;
    setKitchenInsightView((current) => (views.includes(current) ? current : views[0]));
  }

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
        <p className="sc-main-with-nav p-8 text-chef-text-muted">Loading dashboard…</p>
      </>
    );
  }

  const chefName = session?.user?.name ?? "Chef";
  const empty = data.ingredients.total === 0;
  const showDemoLoad = empty || !data.restaurant.isSeeded;
  const financeSummary = data.finance.summary;
  const financePeriodLabel = financePeriodRange(financePeriod).label;
  const showKitchenInsightFilters =
    kitchenInsightEntity === "dishes" ? kitchenInsightView === "topSelling" : true;
  const salesFiltersActive =
    kitchenInsightEntity === "dishes"
      ? dishClassFilters.length > 0
      : ingredientClassFilters.length > 0;

  return (
    <>
      <Nav />
      <main className="sc-main-with-nav sc-main-with-floating-agent sc-page-shell">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-chef-text sm:text-xl">
            Hi {chefName}!!
          </h1>
          {showDemoLoad && (
            <Tooltip content="Load the Panera Cafe demo menu, pantry, and order history">
              <button
                type="button"
                onClick={() => void loadDemo()}
                disabled={seeding}
                className="shrink-0 rounded-lg bg-chef-sage px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-chef-sage-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {seeding ? "Loading…" : "Load test data"}
              </button>
            </Tooltip>
          )}
        </div>

        {seedError && <p className="mt-2 text-sm text-red-600">{seedError}</p>}
        {seedMessage && !seedError && (
          <p className="mt-2 text-sm text-chef-sage">{seedMessage}</p>
        )}

        <div
          className="mt-8 grid w-full grid-cols-3 gap-2"
          role="tablist"
          aria-label="Dashboard sections"
        >
          {DASHBOARD_SECTIONS.map(({ id, agent }) => {
            const active = section === id;
            const tabLabel = agentBrandLabel(agent);
            return (
              <div key={id} className="flex min-w-0 flex-col items-center">
                <div className="mb-2 flex h-[6.5rem] items-end justify-center">
                  {active ? <AgentBrandMark agent={agent} size={104} /> : null}
                </div>
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSection(id)}
                  className={sectionTabClass(active)}
                >
                  {tabLabel}
                </button>
              </div>
            );
          })}
        </div>

        {section === "inventory" && (
          <>
            <section className="mt-6">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="sc-section-title">Dishes</h2>
                <SectionInfo title="Dishes">
                  <p>
                    Counts from your menu catalog. <strong>Active</strong> dishes are on the live
                    menu; <strong>New suggestions</strong> are Creative ideas awaiting review.
                  </p>
                </SectionInfo>
              </div>
              <div className="mt-3 grid items-start gap-3 sm:grid-cols-3">
                <StatCard
                  label="Total dishes"
                  value={data.dishes.total}
                  labelHint="All dishes in your catalog"
                />
                <StatCard
                  label="Active dishes"
                  value={data.dishes.active}
                  labelHint="Approved and on the live menu"
                />
                <StatCard
                  label="New suggestions"
                  value={data.dishes.suggested}
                  labelHint="Creative ideas in Recipes → Suggested"
                />
              </div>
            </section>

            <section className="mt-8">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="sc-section-title">Ingredients</h2>
                <SectionInfo title="Ingredients">
                  <p>
                    Pantry stock levels. <strong>Low stock</strong> is at or below reorder threshold;{" "}
                    <strong>Expiring</strong> lists items due within 7 days — scroll the row to see
                    all.
                  </p>
                </SectionInfo>
              </div>
              <div className="mt-3 grid items-start gap-3 sm:grid-cols-3">
                <StatCard
                  label="Total ingredients"
                  value={data.ingredients.total}
                  labelHint="All pantry items in your catalog"
                />
                <StatCard
                  label="Required / low stock"
                  value={data.ingredients.required}
                  maxItems={2}
                  labelHint="Ingredients at or below reorder threshold"
                  items={data.lowStock.map(
                    (item) =>
                      `${item.name} — ${item.currentQty} ${item.inventoryUnit} (reorder ${item.reorderThreshold})`
                  )}
                />
                <StatCard
                  label="Expiring within 7 days"
                  value={data.ingredients.expiring}
                  horizontalItems
                  labelHint="Use these soon — scroll to see all expiring items"
                  items={data.expiring.map(
                    (item) => `${item.name} — ${item.currentQty} ${item.inventoryUnit}`
                  )}
                />
              </div>
            </section>
          </>
        )}

        {section === "business" && (
          <>
            <CollapsibleDashboardCard
              className="mt-6"
              title="Business Insights"
              open={businessInsightsOpen}
              onToggle={() => setBusinessInsightsOpen((value) => !value)}
              infoContent={
                <>
                  <p>
                    Point of sale revenue, cost of goods sold, and profit for the{" "}
                    {financePeriodLabel}.
                  </p>
                  <p className="mt-3">
                    Periods are relative to today — weekly and bi-weekly roll back from the current
                    date; monthly and quarterly use the current calendar month or quarter.
                  </p>
                </>
              }
              actions={<FinancePeriodToggle period={financePeriod} onChange={setFinancePeriod} />}
            >
              <div className="mt-3 grid items-start gap-3 sm:grid-cols-3">
                <StatCard
                  label="Point of Sale (POS)"
                  value={formatCurrency(financeSummary.sales)}
                  detail={`${financeSummary.posTickets} tickets · ${financeSummary.itemsSold} items · ${financePeriodLabel}`}
                  labelHint="Revenue from processed sales orders (POS tickets)"
                />
                <StatCard
                  label="Cost of Goods Sold (COGS)"
                  value={formatCurrency(financeSummary.soldCogs)}
                  detail={`Food cost for menu items sold · ${financePeriodLabel}`}
                  labelHint="Ingredient cost for items sold on tickets in this period"
                />
                <StatCard
                  label="Profit / Margin"
                  value={formatCurrency(financeSummary.grossProfit)}
                  detail={`${financeSummary.grossMarginPercent.toFixed(1)}% gross margin · ${financePeriodLabel}`}
                  labelHint="POS sales minus COGS for items sold"
                />
              </div>
            </CollapsibleDashboardCard>

            <CollapsibleDashboardCard
              className="mt-3"
              title="Kitchen insights"
              open={kitchenInsightsOpen}
              onToggle={() => setKitchenInsightsOpen((value) => !value)}
              headerControls={
                <KitchenInsightsInlineToggles
                  entity={kitchenInsightEntity}
                  sortAscending={kitchenInsightSortAsc}
                  onEntityChange={handleKitchenInsightEntityChange}
                  onSortChange={setKitchenInsightSortAsc}
                />
              }
              infoContent={
                <>
                  <p>
                    Top {KITCHEN_INSIGHTS_DISPLAY_LIMIT} rankings for the {KITCHEN_INSIGHTS_PERIOD_LABEL},
                    plus top {MARGIN_RANKING_LIMIT} highest and lowest margins per dish. Use dish and
                    pantry class filters to narrow sales rankings.
                  </p>
                  <p className="mt-3">
                    <strong># of Dishes Sold</strong> and <strong>Margin per Dish</strong> use{" "}
                    <strong>Most</strong> / <strong>Least</strong> in the header. Active menu items
                    only for sales counts; margins use ready recipes with food cost and sell price.
                  </p>
                </>
              }
              actions={
                showKitchenInsightFilters ? (
                  <div className="flex flex-wrap gap-2">
                    {kitchenInsightEntity === "dishes" ? (
                      <PantryMultiSelectFilter
                        label="Dish class"
                        placeholder="All dish classes"
                        options={data.salesAnalytics.dishClasses}
                        selected={dishClassFilters}
                        onChange={setDishClassFilters}
                        className="w-full text-sm sm:w-44"
                      />
                    ) : (
                      <PantryMultiSelectFilter
                        label="Pantry class"
                        placeholder="All pantry classes"
                        options={data.salesAnalytics.ingredientClasses}
                        selected={ingredientClassFilters}
                        onChange={setIngredientClassFilters}
                        className="w-full text-sm sm:w-44"
                      />
                    )}
                    {salesFiltersActive && (
                      <Tooltip content="Clear class filters">
                        <button
                          type="button"
                          onClick={() => {
                            if (kitchenInsightEntity === "dishes") {
                              setDishClassFilters([]);
                            } else {
                              setIngredientClassFilters([]);
                            }
                          }}
                          className="rounded-lg border border-chef-border px-3 py-1.5 text-sm text-chef-text-muted hover:text-chef-text"
                        >
                          Clear filters
                        </button>
                      </Tooltip>
                    )}
                  </div>
                ) : null
              }
            >
              <div className="sc-scrollbar-hide shrink-0 -mx-1 flex gap-1 overflow-x-auto rounded-xl border border-chef-border bg-white p-1">
                {visibleKitchenInsightOptions.map((option) => (
                  <Tooltip key={option.id} content={KITCHEN_INSIGHT_HINTS[option.id]}>
                    <button
                      type="button"
                      onClick={() => setKitchenInsightView(option.id)}
                      className={`${businessTabClass(kitchenInsightView === option.id)} shrink-0`}
                    >
                      {option.label}
                    </button>
                  </Tooltip>
                ))}
              </div>

              <div className="mt-4">
                {kitchenInsightView === "topSelling" && (
                  <KitchenInsightChart
                    variant="ranking-bars"
                    maxRows={KITCHEN_INSIGHTS_DISPLAY_LIMIT}
                    emptyMessage="No active dish sales in this period."
                    rows={(kitchenInsightSortAsc
                      ? filteredSalesCharts.leastSellingDishes
                      : filteredSalesCharts.topSellingDishes
                    ).map((dish) => ({
                      slug: dish.slug,
                      name: dish.name,
                      value: dish.value,
                      label: `${dish.value} sold`,
                    }))}
                  />
                )}
                {kitchenInsightView === "topUsed" && (
                  <KitchenInsightChart
                    variant="ranking-bars"
                    maxRows={KITCHEN_INSIGHTS_DISPLAY_LIMIT}
                    emptyMessage="No ingredient usage from sales yet."
                    barClassName="bg-chef-sage-dark"
                    rows={sortInsightRows(
                      filteredSalesCharts.topUsedIngredients.map((ingredient) => ({
                        slug: ingredient.slug,
                        name: ingredient.name,
                        value: ingredient.value,
                        label: `${ingredient.value} units`,
                      })),
                      kitchenInsightSortAsc
                    )}
                  />
                )}
                {kitchenInsightView === "expiry" && (
                  <KitchenInsightChart
                    variant="urgency-meter"
                    maxRows={KITCHEN_INSIGHTS_DISPLAY_LIMIT}
                    emptyMessage="No ingredients expiring soon."
                    rows={sortInsightRows(
                      filteredSalesCharts.approachingExpiry.map((ingredient) => ({
                        slug: ingredient.slug,
                        name: ingredient.name,
                        daysLeft: ingredient.daysLeft,
                        currentQty: ingredient.currentQty,
                        inventoryUnit: ingredient.inventoryUnit,
                      })),
                      kitchenInsightSortAsc
                    )}
                  />
                )}
                {kitchenInsightView === "reorder" && (
                  <KitchenInsightChart
                    variant="reorder-diff"
                    maxRows={KITCHEN_INSIGHTS_DISPLAY_LIMIT}
                    emptyMessage="No ingredients near reorder level."
                    rows={(kitchenInsightSortAsc
                      ? filteredSalesCharts.leastReorderDiff
                      : filteredSalesCharts.approachingReorder
                    ).map((ingredient) => ({
                      slug: ingredient.slug,
                      name: ingredient.name,
                      currentQty: ingredient.currentQty,
                      reorderThreshold: ingredient.reorderThreshold,
                      inventoryUnit: ingredient.inventoryUnit,
                    }))}
                  />
                )}
                {kitchenInsightView === "marginPerDish" && (
                  <KitchenInsightChart
                    variant="margin-composition"
                    maxRows={MARGIN_RANKING_LIMIT}
                    tone={kitchenInsightSortAsc ? "lowest" : "highest"}
                    emptyMessage="No priced dish recipes yet."
                    rows={
                      kitchenInsightSortAsc
                        ? data.margins.dishes.lowest
                        : data.margins.dishes.highest
                    }
                  />
                )}
              </div>
            </CollapsibleDashboardCard>

            <div className="h-10 shrink-0 sm:h-12" aria-hidden />
          </>
        )}

        {section === "create" && <CreativeCuesPanel />}

      </main>
      <SousChefChatDock
        financeView={financePeriod}
        dashboardSection={section}
        onAgentHandoff={setSection}
      />
    </>
  );
}
