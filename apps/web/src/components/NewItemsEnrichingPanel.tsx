"use client";

type Props = {
  readyCount: number;
  totalCount: number;
  statusLabel?: string;
};

function LoadingSpinner() {
  return (
    <svg
      className="mx-auto h-10 w-10 animate-spin text-chef-sage"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export function NewItemsEnrichingPanel({ readyCount, totalCount, statusLabel }: Props) {
  const pending = Math.max(0, totalCount - readyCount);
  const progress = totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0;

  return (
    <section
      className="sc-card mt-6 border-chef-sage/25 bg-gradient-to-br from-chef-sage-light/60 to-chef-surface p-8 text-center"
      role="status"
      aria-live="polite"
    >
      <LoadingSpinner />
      <h2 className="mt-4 text-lg font-semibold text-chef-text">Preparing review cards</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-chef-text-muted">
        {statusLabel ||
          "Item normalizer is cleaning names and finding two photos per item. Cards appear when each row is ready."}
      </p>
      <p className="mt-3 text-sm font-medium text-chef-sage-dark">
        {readyCount} of {totalCount} ready
        {pending > 0 ? ` · ${pending} in progress` : ""}
      </p>
      {totalCount > 0 && (
        <div className="mx-auto mt-4 max-w-xs">
          <div className="h-2 overflow-hidden rounded-full bg-chef-border">
            <div
              className="h-full rounded-full bg-chef-sage transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
