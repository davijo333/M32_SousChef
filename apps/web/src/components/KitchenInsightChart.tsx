"use client";

import type { ReactNode } from "react";
import { formatCurrency } from "@backend/services/dashboard/dashboard-stats";
import { formatPercent } from "@backend/services/dashboard/dashboard-margins";

type RankingRow = {
  slug: string;
  name: string;
  value: number;
  label?: string;
};

type ExpiryRow = {
  slug: string;
  name: string;
  daysLeft: number;
  currentQty: number;
  inventoryUnit: string;
};

type ReorderRow = {
  slug: string;
  name: string;
  currentQty: number;
  reorderThreshold: number;
  inventoryUnit: string;
};

type MarginRow = {
  slug: string;
  name: string;
  sellPrice: number;
  foodCost: number;
  marginDollars: number;
  marginPercent: number;
};

type KitchenInsightChartProps = {
  compact?: boolean;
} & (
  | {
      variant: "ranking-bars";
      emptyMessage: string;
      rows: RankingRow[];
      maxRows?: number;
      barClassName?: string;
    }
  | {
      variant: "urgency-meter";
      emptyMessage: string;
      rows: ExpiryRow[];
      maxRows?: number;
    }
  | {
      variant: "threshold-meter";
      emptyMessage: string;
      rows: ReorderRow[];
      maxRows?: number;
    }
  | {
      variant: "reorder-diff";
      emptyMessage: string;
      rows: ReorderRow[];
      maxRows?: number;
    }
  | {
      variant: "margin-composition";
      emptyMessage: string;
      rows: MarginRow[];
      maxRows?: number;
      tone?: "highest" | "lowest";
    }
);

function ChartShell({
  emptyMessage,
  hasRows,
  compact = false,
  children,
}: {
  emptyMessage: string;
  hasRows: boolean;
  compact?: boolean;
  children: ReactNode;
}) {
  if (!hasRows) {
    return <p className="text-xs text-chef-text-muted">{emptyMessage}</p>;
  }
  return <div className={compact ? "space-y-2" : "space-y-3"}>{children}</div>;
}

function RankingBarsChart({
  rows,
  maxRows,
  barClassName = "bg-chef-sage",
  emptyMessage,
  compact = false,
}: Extract<KitchenInsightChartProps, { variant: "ranking-bars" }>) {
  const visibleRows = maxRows ? rows.slice(0, maxRows) : rows;
  const maxValue = Math.max(1, ...visibleRows.map((row) => Math.abs(row.value)));

  return (
    <ChartShell compact={compact} emptyMessage={emptyMessage} hasRows={visibleRows.length > 0}>
      {visibleRows.map((row, index) => {
        const width = Math.max(4, (Math.abs(row.value) / maxValue) * 100);
        return (
          <div key={row.slug}>
            <div
              className={`flex items-baseline justify-between gap-2 ${
                compact ? "mb-1 text-xs" : "mb-1.5 text-sm"
              }`}
            >
              <span className="min-w-0 truncate font-medium text-chef-text" title={row.name}>
                <span className="mr-1.5 tabular-nums text-chef-sage">{index + 1}.</span>
                {row.name}
              </span>
              <span className="shrink-0 tabular-nums text-chef-text-muted">
                {row.label ?? row.value}
              </span>
            </div>
            <div className={`overflow-hidden rounded-full bg-chef-muted ${compact ? "h-2.5" : "h-3"}`}>
              <div
                className={`h-full rounded-full ${barClassName}`}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </ChartShell>
  );
}

function UrgencyMeterChart({
  rows,
  maxRows,
  emptyMessage,
  compact = false,
}: Extract<KitchenInsightChartProps, { variant: "urgency-meter" }>) {
  const visibleRows = maxRows ? rows.slice(0, maxRows) : rows;

  return (
    <ChartShell compact={compact} emptyMessage={emptyMessage} hasRows={visibleRows.length > 0}>
      {visibleRows.map((row, index) => {
        const urgency = Math.max(0, Math.min(7, row.daysLeft));
        const filledCells = 7 - urgency;
        return (
          <div
            key={row.slug}
            className={`rounded-lg border border-chef-border/80 bg-chef-muted/20 ${
              compact ? "px-2.5 py-2" : "px-3 py-2.5"
            }`}
          >
            <div
              className={`flex items-baseline justify-between gap-2 ${
                compact ? "mb-1 text-xs" : "mb-1.5 text-sm"
              }`}
            >
              <span className="min-w-0 truncate font-medium text-chef-text" title={row.name}>
                <span className="mr-1.5 tabular-nums text-chef-amber">{index + 1}.</span>
                {row.name}
              </span>
              <span className="shrink-0 tabular-nums text-chef-text-muted">
                {row.daysLeft}d · {row.currentQty} {row.inventoryUnit}
              </span>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: 7 }).map((_, cellIndex) => {
                const isUrgent = cellIndex < filledCells;
                return (
                  <span
                    key={cellIndex}
                    className={`h-2 flex-1 rounded-sm sm:h-2.5 ${
                      isUrgent
                        ? cellIndex < 2
                          ? "bg-red-400"
                          : cellIndex < 4
                            ? "bg-chef-amber"
                            : "bg-chef-amber/50"
                        : "bg-chef-muted"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </ChartShell>
  );
}

function ThresholdMeterChart({
  rows,
  maxRows,
  emptyMessage,
  compact = false,
}: Extract<KitchenInsightChartProps, { variant: "threshold-meter" }>) {
  const visibleRows = maxRows ? rows.slice(0, maxRows) : rows;

  return (
    <ChartShell compact={compact} emptyMessage={emptyMessage} hasRows={visibleRows.length > 0}>
      {visibleRows.map((row, index) => {
        const cap = Math.max(row.reorderThreshold * 1.5, row.currentQty, 1);
        const stockWidth = Math.max(4, (row.currentQty / cap) * 100);
        const thresholdWidth = Math.max(4, (row.reorderThreshold / cap) * 100);
        return (
          <div
            key={row.slug}
            className={`rounded-lg border border-chef-border/80 bg-chef-muted/20 ${
              compact ? "px-2.5 py-2" : "px-3 py-2.5"
            }`}
          >
            <div
              className={`flex items-baseline justify-between gap-2 ${
                compact ? "mb-1 text-xs" : "mb-1.5 text-sm"
              }`}
            >
              <span className="min-w-0 truncate font-medium text-chef-text" title={row.name}>
                <span className="mr-1.5 tabular-nums text-red-500">{index + 1}.</span>
                {row.name}
              </span>
              <span className="shrink-0 tabular-nums text-chef-text-muted">
                {row.currentQty} {row.inventoryUnit}
              </span>
            </div>
            <div className={`relative overflow-hidden rounded-md bg-chef-muted ${compact ? "h-2.5" : "h-3.5"}`}>
              <div
                className="absolute inset-y-0 left-0 rounded-md bg-red-400/80"
                style={{ width: `${stockWidth}%` }}
              />
              <div
                className="absolute inset-y-0 w-0.5 bg-chef-text/70"
                style={{ left: `${thresholdWidth}%` }}
                title={`Reorder at ${row.reorderThreshold}`}
              />
            </div>
            {!compact ? (
              <p className="mt-1 text-[11px] text-chef-text-muted">
                Reorder at {row.reorderThreshold} {row.inventoryUnit}
              </p>
            ) : null}
          </div>
        );
      })}
    </ChartShell>
  );
}

function ReorderDiffChart({
  rows,
  maxRows,
  emptyMessage,
  compact = false,
}: Extract<KitchenInsightChartProps, { variant: "reorder-diff" }>) {
  const visibleRows = maxRows ? rows.slice(0, maxRows) : rows;
  const maxAbsDiff = Math.max(
    1,
    ...visibleRows.map((row) => Math.abs(row.currentQty - row.reorderThreshold))
  );

  return (
    <ChartShell compact={compact} emptyMessage={emptyMessage} hasRows={visibleRows.length > 0}>
      {visibleRows.map((row, index) => {
        const diff = row.currentQty - row.reorderThreshold;
        const width = Math.max(4, (Math.abs(diff) / maxAbsDiff) * 100);
        const barClass = diff < 0 ? "bg-red-400" : "bg-chef-sage";
        const diffLabel = `${diff > 0 ? "+" : ""}${diff} ${row.inventoryUnit}`;
        return (
          <div
            key={row.slug}
            className={`rounded-lg border border-chef-border/80 bg-chef-muted/20 ${
              compact ? "px-2.5 py-2" : "px-3 py-2.5"
            }`}
          >
            <div
              className={`flex items-baseline justify-between gap-2 ${
                compact ? "mb-1 text-xs" : "mb-1.5 text-sm"
              }`}
            >
              <span className="min-w-0 truncate font-medium text-chef-text" title={row.name}>
                <span className="mr-1.5 tabular-nums text-red-500">{index + 1}.</span>
                {row.name}
              </span>
              <span className="shrink-0 tabular-nums text-chef-text-muted">{diffLabel}</span>
            </div>
            <div className={`overflow-hidden rounded-md bg-chef-muted ${compact ? "h-2.5" : "h-3.5"}`}>
              <div className={`h-full rounded-md ${barClass}`} style={{ width: `${width}%` }} />
            </div>
            {!compact ? (
              <p className="mt-1 text-[11px] text-chef-text-muted">
                {row.currentQty} on hand · reorder {row.reorderThreshold} {row.inventoryUnit}
              </p>
            ) : null}
          </div>
        );
      })}
    </ChartShell>
  );
}

function MarginCompositionChart({
  rows,
  maxRows,
  emptyMessage,
  tone = "highest",
  compact = false,
}: Extract<KitchenInsightChartProps, { variant: "margin-composition" }>) {
  const visibleRows = maxRows ? rows.slice(0, maxRows) : rows;
  const marginClass = tone === "highest" ? "bg-chef-sage" : "bg-chef-amber";

  return (
    <ChartShell compact={compact} emptyMessage={emptyMessage} hasRows={visibleRows.length > 0}>
      {visibleRows.map((row, index) => {
        const foodShare =
          row.sellPrice > 0 ? Math.max(0, Math.min(100, (row.foodCost / row.sellPrice) * 100)) : 0;
        const marginShare = row.sellPrice > 0 ? Math.max(0, 100 - foodShare) : 0;
        return (
          <div
            key={row.slug}
            className={`rounded-lg border border-chef-border/80 bg-white ${
              compact ? "px-2.5 py-2" : "px-3 py-2.5"
            }`}
          >
            <div
              className={`flex items-baseline justify-between gap-2 ${
                compact ? "mb-1 text-xs" : "mb-1.5 text-sm"
              }`}
            >
              <span className="min-w-0 truncate font-medium text-chef-text" title={row.name}>
                <span className="mr-1.5 tabular-nums text-chef-sage">{index + 1}.</span>
                {row.name}
              </span>
              <span className="shrink-0 tabular-nums text-chef-text-muted">
                {formatCurrency(row.marginDollars)} ({formatPercent(row.marginPercent)})
              </span>
            </div>
            <div className={`flex overflow-hidden rounded-md bg-chef-muted ${compact ? "h-2.5" : "h-3.5"}`}>
              <div
                className="h-full bg-chef-text/20"
                style={{ width: `${foodShare}%` }}
                title={`Food cost ${formatCurrency(row.foodCost)}`}
              />
              <div
                className={`h-full ${marginClass}`}
                style={{ width: `${marginShare}%` }}
                title={`Margin ${formatCurrency(row.marginDollars)}`}
              />
            </div>
            {!compact ? (
              <div className="mt-1 flex justify-between text-[11px] text-chef-text-muted">
                <span>Cost {formatCurrency(row.foodCost)}</span>
                <span>Price {formatCurrency(row.sellPrice)}</span>
              </div>
            ) : null}
          </div>
        );
      })}
    </ChartShell>
  );
}

export function KitchenInsightChart(props: KitchenInsightChartProps) {
  switch (props.variant) {
    case "ranking-bars":
      return <RankingBarsChart {...props} />;
    case "urgency-meter":
      return <UrgencyMeterChart {...props} />;
    case "threshold-meter":
      return <ThresholdMeterChart {...props} />;
    case "reorder-diff":
      return <ReorderDiffChart {...props} />;
    case "margin-composition":
      return <MarginCompositionChart {...props} />;
  }
}
