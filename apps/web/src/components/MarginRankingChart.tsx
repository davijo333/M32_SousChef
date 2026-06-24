"use client";

type RankingRow = {
  slug: string;
  name: string;
  value: number;
  label?: string;
};

type MarginRankingChartProps = {
  title: string;
  subtitle: string;
  emptyMessage: string;
  rows: RankingRow[];
  formatValue?: (value: number) => string;
  barClassName?: string;
};

export function MarginRankingChart({
  title,
  subtitle,
  emptyMessage,
  rows,
  formatValue = (value) => String(value),
  barClassName = "bg-chef-sage",
}: MarginRankingChartProps) {
  const maxValue = Math.max(1, ...rows.map((row) => Math.abs(row.value)));

  return (
    <div className="sc-card p-4">
      <h3 className="text-sm font-semibold text-chef-text">{title}</h3>
      <p className="mt-1 text-xs text-chef-text-muted">{subtitle}</p>

      {rows.length > 0 ? (
        <div className="mt-5 space-y-3">
          {rows.map((row, index) => {
            const width = Math.max(4, (Math.abs(row.value) / maxValue) * 100);
            return (
              <div key={row.slug}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate font-medium text-chef-text" title={row.name}>
                    <span className="mr-1.5 tabular-nums text-chef-sage">{index + 1}.</span>
                    {row.name}
                  </span>
                  <span className="shrink-0 tabular-nums text-chef-text-muted">
                    {row.label ?? formatValue(row.value)}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-chef-muted">
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
        <p className="mt-5 text-sm text-chef-text-muted">{emptyMessage}</p>
      )}
    </div>
  );
}
