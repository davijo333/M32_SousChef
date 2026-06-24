"use client";

type RankingRow = {
  slug: string;
  name: string;
  value: number;
  label?: string;
};

type MarginRankingChartProps = {
  title?: string;
  subtitle?: string;
  emptyMessage: string;
  rows: RankingRow[];
  maxRows?: number;
  formatValue?: (value: number) => string;
  barClassName?: string;
};

export function MarginRankingChart({
  title,
  subtitle,
  emptyMessage,
  rows,
  maxRows,
  formatValue = (value) => String(value),
  barClassName = "bg-chef-sage",
}: MarginRankingChartProps) {
  const visibleRows = maxRows ? rows.slice(0, maxRows) : rows;
  const maxValue = Math.max(1, ...visibleRows.map((row) => Math.abs(row.value)));
  const showHeader = Boolean(title || subtitle);

  return (
    <div className="sc-card p-3">
      {showHeader ? (
        <div className={rows.length > 0 ? "mb-3" : ""}>
          {title ? <p className="text-sm font-medium text-chef-text">{title}</p> : null}
          {subtitle ? (
            <p className={`text-xs leading-snug text-chef-text-muted ${title ? "mt-0.5" : ""}`}>
              {subtitle}
            </p>
          ) : null}
        </div>
      ) : null}

      {visibleRows.length > 0 ? (
        <div className="space-y-2.5">
          {visibleRows.map((row, index) => {
            const width = Math.max(4, (Math.abs(row.value) / maxValue) * 100);
            return (
              <div key={row.slug}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs sm:text-sm">
                  <span className="min-w-0 truncate font-medium text-chef-text" title={row.name}>
                    <span className="mr-1.5 tabular-nums text-chef-sage">{index + 1}.</span>
                    {row.name}
                  </span>
                  <span className="shrink-0 tabular-nums text-chef-text-muted">
                    {row.label ?? formatValue(row.value)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-chef-muted">
                  <div
                    className={`h-full rounded-full ${barClassName}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className={`text-xs text-chef-text-muted ${showHeader ? "mt-3" : ""}`}>{emptyMessage}</p>
      )}
    </div>
  );
}
