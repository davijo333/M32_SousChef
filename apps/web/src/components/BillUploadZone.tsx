"use client";

import { useEffect, useRef, useState } from "react";
import type { NewCatalogItem } from "@/lib/extract-new-items";
import { validateBillFilenameForZone } from "@/lib/bill-filename";

type BillLine = {
  rawName: string;
  normalizedName?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  confidence: number;
  suggestedCategory: string;
  included: boolean;
  matchedIngredientSlug?: string;
  matchedMenuItemSlug?: string;
};

type ParseResult = {
  billId: string;
  vendor: string;
  billDate?: string;
  invoiceNumber?: string;
  filename: string;
  fileUrl?: string;
  lineCount: number;
  lines: BillLine[];
};

export type SavedBill = {
  billId: string;
  filename: string;
  fileUrl?: string;
  vendor: string;
  billDate?: string;
  invoiceNumber?: string;
  status: string;
  lineCount: number;
  lines: BillLine[];
  uploadDate: string;
};

type BillEntry = {
  id: string;
  filename: string;
  file?: File;
  status: "queued" | "parsing" | "parsed" | "error" | "confirmed";
  error?: string;
  result?: ParseResult;
  expanded: boolean;
  removing?: boolean;
};

function entryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function billLabelFromTitle(title: string, billType: "supplier" | "customer") {
  if (billType === "supplier") return "purchase orders";
  return "sales orders";
}

const PARSE_TIMEOUT_MS = 95_000;
/** Upload up to this many bills to the agent at once (matches agent BILL_PIPELINE_PARALLEL). */
const PARALLEL_BILL_UPLOADS = 5;

function billFileHref(billId: string) {
  return `/api/bills/${billId}/file`;
}

type ProcessStats = {
  totalUpdated: number;
  totalNewAdded: number;
  billsProcessed: number;
};

function LoadingSpinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin text-chef-sage ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function RetryIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

type Props = {
  billType: "supplier" | "customer";
  title: string;
  description: string;
  onBillsConfirmed?: (
    items: {
      ingredients: NewCatalogItem[];
      dishes: NewCatalogItem[];
      missingIngredients?: NewCatalogItem[];
    },
    billIds: string[],
    billType: "supplier" | "customer"
  ) => void;
  /** Start normalizer + images while later files are still parsing */
  onNewItemsDiscovered?: (
    items: {
      ingredients: NewCatalogItem[];
      dishes: NewCatalogItem[];
      missingIngredients?: NewCatalogItem[];
    },
    billType: "supplier" | "customer"
  ) => void;
  onBillRemoved?: (billId: string) => void;
  onProcessingChange?: (processing: boolean) => void;
  processedBillIds?: string[];
  initialBills?: SavedBill[];
  historyByDate?: Record<string, { supplier: SavedBill[]; customer?: SavedBill[] }>;
  /** Sales-order column: wait until purchase orders are saved first */
  requiresSupplierFirst?: boolean;
  supplierReady?: boolean;
  /** Upload page: keep zone clear — only show in-flight files; processed orders go to PO table */
  stagingOnly?: boolean;
  onProcessed?: (billIds: string[]) => void;
};

function matchCount(lines: BillLine[]) {
  return lines.filter((l) => l.matchedIngredientSlug || l.matchedMenuItemSlug).length;
}

function billToEntry(bill: SavedBill): BillEntry {
  return {
    id: entryId(),
    filename: bill.filename,
    status: bill.status === "confirmed" ? "confirmed" : "parsed",
    expanded: false,
    result: {
      billId: bill.billId,
      vendor: bill.vendor,
      billDate: bill.billDate,
      invoiceNumber: bill.invoiceNumber,
      filename: bill.filename,
      fileUrl: bill.fileUrl,
      lineCount: bill.lineCount,
      lines: bill.lines,
    },
  };
}

export function BillUploadZone({
  billType,
  title,
  description,
  onBillsConfirmed,
  onNewItemsDiscovered,
  onBillRemoved,
  onProcessingChange,
  processedBillIds,
  initialBills,
  historyByDate,
  requiresSupplierFirst,
  supplierReady,
  stagingOnly,
  onProcessed,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<BillEntry[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [activeFilename, setActiveFilename] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [batchMsg, setBatchMsg] = useState("");
  const [batchError, setBatchError] = useState("");
  const [processStats, setProcessStats] = useState<ProcessStats | null>(null);
  const [uploading, setUploading] = useState(false);
  const billLabel = billLabelFromTitle(title, billType);

  useEffect(() => {
    if (!initialBills?.length) return;
    const pending = stagingOnly
      ? initialBills.filter((b) => b.status !== "confirmed")
      : initialBills;
    if (!pending.length) return;
    setEntries((prev) => {
      const existingIds = new Set(
        prev.map((e) => e.result?.billId).filter(Boolean) as string[]
      );
      const restored = pending
        .filter((b) => !existingIds.has(b.billId))
        .map(billToEntry);
      return restored.length ? [...restored, ...prev] : prev;
    });
  }, [initialBills, stagingOnly]);

  useEffect(() => {
    if (!processedBillIds?.length) return;
    const idSet = new Set(processedBillIds);
    setEntries((prev) =>
      prev.map((e) =>
        e.result && idSet.has(e.result.billId) ? { ...e, status: "confirmed" as const } : e
      )
    );
  }, [processedBillIds]);

  function updateEntry(id: string, patch: Partial<BillEntry>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function toggleExpanded(id: string) {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, expanded: !e.expanded } : e))
    );
  }

  async function parseFile(
    file: File,
    id: string
  ): Promise<{
    result: ParseResult;
    newCatalogItems: { ingredients: NewCatalogItem[]; dishes: NewCatalogItem[] };
  } | null> {
    updateEntry(id, { status: "parsing" });

    const form = new FormData();
    form.append("file", file);
    form.append("billType", billType);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);

    try {
      const res = await fetch("/api/bills/parse", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      const data = await res.json();

      if (res.status === 401) {
        updateEntry(id, {
          status: "error",
          error: "Session expired — please log in again",
          file: undefined,
        });
        return null;
      }

      if (!res.ok) {
        updateEntry(id, {
          status: "error",
          error: data.error ?? "Could not read this order",
        });
        return null;
      }

      updateEntry(id, { status: "parsed", result: data, expanded: false });
      return {
        result: data as ParseResult,
        newCatalogItems: (data.newCatalogItems ?? {
          ingredients: [],
          dishes: [],
        }) as { ingredients: NewCatalogItem[]; dishes: NewCatalogItem[] },
      };
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "AbortError";
      updateEntry(id, {
        status: "error",
        error: timedOut
          ? "Timed out — try uploading fewer files at once"
          : "Network error",
      });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function retryEntry(entry: BillEntry) {
    if (!entry.file || isBusy) return;

    setUploading(true);
    onProcessingChange?.(true);
    setActiveFilename(entry.filename);
    try {
      const parsed = await parseFile(entry.file, entry.id);
      if (parsed?.newCatalogItems) {
        const hasNew =
          parsed.newCatalogItems.ingredients.length > 0 ||
          parsed.newCatalogItems.dishes.length > 0;
        if (hasNew) {
          onNewItemsDiscovered?.(parsed.newCatalogItems, billType);
        }
      }
    } finally {
      setUploading(false);
      onProcessingChange?.(false);
      setActiveFilename("");
    }
  }

  function queueFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length || uploading || confirming) return;

    setBatchMsg("");
    setBatchError("");
    setProcessStats(null);

    const inFlight = entries.filter(
      (e) => e.status === "queued" || e.status === "parsing" || e.status === "parsed"
    ).length;
    const slotsLeft = Math.max(0, PARALLEL_BILL_UPLOADS - inFlight);

    const accepted: BillEntry[] = [];
    const rejected: BillEntry[] = [];
    const overflow: string[] = [];

    for (const file of list) {
      const check = validateBillFilenameForZone(file.name, billType);
      if (!check.ok) {
        rejected.push({
          id: entryId(),
          filename: file.name,
          status: "error",
          error: check.error,
          expanded: false,
        });
        continue;
      }
      if (accepted.length >= slotsLeft) {
        overflow.push(file.name);
        continue;
      }
      accepted.push({
        id: entryId(),
        filename: file.name,
        file,
        status: "queued",
        expanded: false,
      });
    }

    if (overflow.length) {
      setBatchError(
        `Only ${PARALLEL_BILL_UPLOADS} files at a time — ${overflow.length} file${overflow.length !== 1 ? "s" : ""} not queued. Process or remove current files first.`
      );
    }

    if (accepted.length) {
      setEntries((prev) => [...accepted, ...prev]);
      void uploadQueued(accepted);
    }
    if (rejected.length) {
      setEntries((prev) => [...rejected, ...prev]);
      if (!overflow.length) {
        setBatchError(
          rejected.length === 1
            ? rejected[0].error!
            : `${rejected.length} files rejected — use the correct column (purchase order: .s_bill., sales order: .c_bill.).`
        );
      }
    }

    if (inputRef.current) inputRef.current.value = "";
  }

  async function uploadQueued(toUpload: BillEntry[]) {
    if (!toUpload.length) return;

    setUploading(true);
    onProcessingChange?.(true);
    setProgress({ current: 0, total: toUpload.length });

    let completed = 0;
    let index = 0;
    const workers = Math.min(PARALLEL_BILL_UPLOADS, toUpload.length);

    async function worker() {
      while (true) {
        const i = index++;
        if (i >= toUpload.length) break;
        const entry = toUpload[i];
        setActiveFilename(entry.filename);
        if (entry.file) {
          const parsed = await parseFile(entry.file, entry.id);
          if (parsed?.newCatalogItems) {
            const hasNew =
              parsed.newCatalogItems.ingredients.length > 0 ||
              parsed.newCatalogItems.dishes.length > 0;
            if (hasNew) {
              onNewItemsDiscovered?.(parsed.newCatalogItems, billType);
            }
          }
        }
        completed += 1;
        setProgress({ current: completed, total: toUpload.length });
      }
    }

    try {
      await Promise.all(Array.from({ length: workers }, () => worker()));
    } finally {
      setUploading(false);
      onProcessingChange?.(false);
      setActiveFilename("");
    }
  }

  async function removeEntry(entry: BillEntry) {
    if (entry.status === "parsing" || entry.status === "confirmed" || entry.removing) return;

    if (entry.result?.billId) {
      setRemovingId(entry.id);
      updateEntry(entry.id, { removing: true });

      try {
        const res = await fetch(`/api/bills/${entry.result.billId}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) {
          updateEntry(entry.id, {
            removing: false,
            error: data.error ?? "Could not remove this order",
          });
          return;
        }
        onBillRemoved?.(entry.result.billId);
      } catch {
        updateEntry(entry.id, {
          removing: false,
          error: "Network error — could not remove",
        });
        return;
      } finally {
        setRemovingId(null);
      }
    }

    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
  }

  async function processAll() {
    const toProcess = entries.filter((e) => e.status === "parsed" && e.result?.billId);
    if (!toProcess.length || confirming) return;
    if (requiresSupplierFirst && !supplierReady) {
      setBatchError("Process purchase orders first — they add inventory before sales orders.");
      return;
    }

    setConfirming(true);
    setBatchError("");
    setBatchMsg("");
    setProcessStats(null);
    onProcessingChange?.(true);
    setProgress({ current: 0, total: toProcess.length });
    setActiveFilename("");

    const billIds = toProcess.map((e) => e.result!.billId);

    try {
      const res = await fetch("/api/bills/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billIds }),
      });

      const data = await res.json();

      if (!res.ok) {
        setBatchError(data.error ?? "Processing failed");
        return;
      }

      const results = data.results as Array<{ billId: string; ok: boolean; error?: string }>;
      const resultByBillId = new Map(results.map((r) => [r.billId, r]));
      const alreadyProcessed = "Order already processed";
      const confirmedBillIds = results
        .filter((r) => r.ok || r.error === alreadyProcessed)
        .map((r) => r.billId);

      setEntries((prev) => {
        const next = prev.map((e) => {
          const billId = e.result?.billId;
          if (!billId) return e;
          const row = resultByBillId.get(billId);
          if (!row) return e;
          if (row.ok || row.error === alreadyProcessed) {
            return { ...e, status: "confirmed" as const, file: undefined };
          }
          return {
            ...e,
            status: "error" as const,
            error:
              row.error === "Order not found"
                ? "This file is no longer saved — upload it again"
                : row.error ?? "Could not process",
          };
        });
        if (stagingOnly) {
          return next.filter((e) => e.status !== "confirmed");
        }
        return next;
      });

      const totalUpdated = Number(data.updatedIngredients ?? 0);
      const totalNewAdded = Number(data.createdIngredients ?? 0);
      const billsProcessed = Number(data.confirmed ?? confirmedBillIds.length);

      if (billsProcessed > 0) {
        setProcessStats({ totalUpdated, totalNewAdded, billsProcessed });
      }

      if (data.failed > 0) {
        const failedRows = results.filter((r) => !r.ok);
        const onlyAlreadySaved = failedRows.every((r) => r.error === alreadyProcessed);
        if (!onlyAlreadySaved) {
          setBatchError(data.message);
        } else if (data.confirmed === 0) {
          setBatchMsg("All selected orders were already processed.");
        }
      }

      if (confirmedBillIds.length) {
        onProcessed?.(confirmedBillIds);
        const fromConfirm = (data.newCatalogItems ?? {
          ingredients: [],
          dishes: [],
        }) as { ingredients: NewCatalogItem[]; dishes: NewCatalogItem[] };
        const missingFromConfirm = (data.missingIngredients ?? []) as NewCatalogItem[];
        onBillsConfirmed?.(
          {
            ingredients: fromConfirm.ingredients ?? [],
            dishes: fromConfirm.dishes ?? [],
            missingIngredients: missingFromConfirm,
          },
          confirmedBillIds,
          billType
        );
      }
    } finally {
      setConfirming(false);
      onProcessingChange?.(false);
      setActiveFilename("");
    }
  }

  const visibleEntries = stagingOnly
    ? entries.filter((e) => e.status !== "confirmed")
    : entries;

  const queuedCount = visibleEntries.filter((e) => e.status === "queued").length;
  const parsingCount = visibleEntries.filter((e) => e.status === "parsing").length;
  const parsedCount = visibleEntries.filter((e) => e.status === "parsed").length;
  const processCount = parsedCount;
  const confirmedCount = entries.filter((e) => e.status === "confirmed").length;
  const errorCount = visibleEntries.filter((e) => e.status === "error").length;
  const retryCount = visibleEntries.filter((e) => e.status === "error" && e.file).length;
  const isBusy = uploading || confirming || parsingCount > 0;

  return (
    <div className="sc-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-chef-text">{title}</h2>
      <p className="mt-1 text-base text-chef-text-muted">{description}</p>
      {requiresSupplierFirst && !supplierReady && (
        <p className="mt-2 rounded-lg bg-chef-amber-light/80 px-3 py-2 text-sm text-chef-amber">
          Save purchase orders first — inventory is added before sales orders are processed.
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".png,.jpg,.jpeg,.pdf,image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files?.length) queueFiles(files);
        }}
      />

      <button
        type="button"
        disabled={isBusy || confirming}
        onClick={() => inputRef.current?.click()}
        className="mt-4 w-full rounded-xl border-2 border-dashed border-chef-sage/35 bg-chef-sage-light/30 p-5 text-base text-chef-text transition hover:border-chef-sage/60 hover:bg-chef-sage-light/50 disabled:opacity-50 sm:p-6"
      >
        {uploading || parsingCount > 0 ? (
          <span className="flex flex-col items-center justify-center gap-2">
            <LoadingSpinner className="h-6 w-6" />
            <span className="font-medium">
              Uploading {billLabel} (up to {PARALLEL_BILL_UPLOADS} at a time)
              {progress.total > 1 ? ` — ${progress.current} of ${progress.total} done` : ""}
            </span>
            {activeFilename && (
              <span className="max-w-full truncate text-sm text-chef-text-muted">{activeFilename}</span>
            )}
          </span>
        ) : (
          <span>
            <span className="font-semibold text-chef-sage">Choose files</span>
            <span className="text-chef-text-muted"> — PDF or photo, one or many</span>
          </span>
        )}
      </button>

      {isBusy && (
        <div
          className="mt-3 flex items-center gap-3 rounded-xl border border-chef-border bg-chef-muted px-4 py-3 text-base text-chef-text"
          role="status"
          aria-live="polite"
        >
          <LoadingSpinner className="h-5 w-5 shrink-0" />
          <span className="min-w-0 truncate">
            {confirming
              ? "Processing orders and updating inventory…"
              : uploading || parsingCount > 0
                ? `Uploading ${billLabel}${activeFilename ? ` — ${activeFilename}` : "…"}`
                : "Working…"}
          </span>
        </div>
      )}

      {batchError && <p className="mt-3 text-base text-red-700">{batchError}</p>}
      {batchMsg && <p className="mt-3 text-base text-chef-sage">{batchMsg}</p>}

      {processStats && !stagingOnly && (
        <div
          className="mt-4 rounded-xl border border-chef-sage/30 bg-chef-sage-light/50 p-4"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-semibold text-chef-sage-dark">
            Processed {processStats.billsProcessed} order
            {processStats.billsProcessed !== 1 ? "s" : ""}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-chef-text-muted">Total items updated</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums text-chef-text">
                {processStats.totalUpdated}
              </p>
              <p className="text-xs text-chef-text-muted">Existing ingredients · stock adjusted</p>
            </div>
            <div>
              <p className="text-sm text-chef-text-muted">Total new added</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums text-chef-text">
                {processStats.totalNewAdded}
              </p>
              <p className="text-xs text-chef-text-muted">New ingredients created</p>
            </div>
          </div>
        </div>
      )}

      {visibleEntries.length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-base text-chef-text-muted">
            <span>
              {visibleEntries.length} file{visibleEntries.length !== 1 ? "s" : ""}
              {queuedCount > 0 && ` · ${queuedCount} waiting`}
              {parsingCount > 0 && ` · ${parsingCount} uploading`}
              {parsedCount > 0 && ` · ${parsedCount} ready to process`}
              {!stagingOnly && confirmedCount > 0 && ` · ${confirmedCount} processed`}
              {retryCount > 0 && ` · ${retryCount} to retry`}
              {errorCount > retryCount && ` · ${errorCount - retryCount} invalid`}
            </span>
            {processCount > 0 && (
              <button
                type="button"
                onClick={processAll}
                disabled={
                  confirming ||
                  (requiresSupplierFirst === true && supplierReady === false)
                }
                className="sc-btn-primary py-2 text-sm"
              >
                {confirming ? "Processing…" : `Process (${processCount})`}
              </button>
            )}
            {errorCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  setEntries((prev) => prev.filter((e) => e.status !== "error"))
                }
                disabled={isBusy || confirming}
                className="rounded-lg border border-chef-border px-3 py-2 text-sm text-chef-text-muted hover:bg-chef-muted"
              >
                Clear failed
              </button>
            )}
          </div>

          <div className="max-h-80 space-y-2 overflow-y-auto">
            {visibleEntries.map((entry) => (
              <div
                key={entry.id}
                className={`rounded-xl border transition-colors ${
                  entry.status === "parsing"
                    ? "border-chef-sage/40 bg-chef-sage-light/40"
                    : entry.status === "error"
                      ? "border-chef-amber/40 bg-chef-amber-light/30"
                      : "border-chef-border bg-chef-muted/50"
                }`}
              >
                <div className="flex items-stretch gap-1">
                <button
                  type="button"
                  onClick={() => entry.result && toggleExpanded(entry.id)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left"
                  disabled={!entry.result}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium text-chef-text">{entry.filename}</p>
                    {(entry.status === "queued" || entry.status === "parsing") && (
                      <p className="mt-1 flex items-center gap-2 text-sm text-chef-text-muted">
                        {entry.status === "parsing" && (
                          <LoadingSpinner className="h-4 w-4 shrink-0" />
                        )}
                        {entry.status === "parsing"
                          ? `Uploading ${billLabel}…`
                          : "Waiting to upload"}
                      </p>
                    )}
                    {entry.result && (
                      <p className="truncate text-sm text-chef-text-muted">
                        {entry.result.vendor || "Unknown vendor"}
                        {entry.result.invoiceNumber ? ` · Invoice ${entry.result.invoiceNumber}` : ""}
                        {" · "}
                        {entry.result.lineCount} line items
                        {" · "}
                        {matchCount(entry.result.lines)} already in kitchen
                        {entry.result.billId && (
                          <>
                            {" · "}
                            <a
                              href={billFileHref(entry.result.billId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-chef-sage underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              View file
                            </a>
                          </>
                        )}
                      </p>
                    )}
                    {entry.status === "error" && !entry.file && (
                      <p className="mt-1 text-sm text-red-700">{entry.error ?? "Invalid file"}</p>
                    )}
                    {entry.status === "error" && entry.file && entry.error && (
                      <p className="mt-1 text-sm text-red-700">{entry.error}</p>
                    )}
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-chef-text-muted">
                    {entry.status === "parsing" && (
                      <LoadingSpinner className="h-4 w-4" />
                    )}
                    {entry.status === "queued" && "Queued"}
                    {entry.status === "parsing" && "Uploading…"}
                    {entry.status === "parsed" && (
                      <span className="text-chef-amber">Ready</span>
                    )}
                    {entry.status === "confirmed" && (
                      <span className="text-chef-sage">Processed</span>
                    )}
                    {entry.status === "error" && !entry.file && "Invalid"}
                    {entry.result && (entry.expanded ? " ▲" : " ▼")}
                  </span>
                </button>
                {entry.status === "error" && entry.file && (
                  <button
                    type="button"
                    onClick={() => void retryEntry(entry)}
                    disabled={isBusy || confirming}
                    className="flex shrink-0 items-center justify-center px-3 py-3 text-chef-sage transition hover:bg-chef-sage-light/60 hover:text-chef-sage-dark disabled:opacity-40"
                    aria-label={`Retry ${entry.filename}`}
                    title="Retry upload"
                  >
                    <RetryIcon />
                  </button>
                )}
                {(entry.status === "queued" ||
                  entry.status === "parsed" ||
                  entry.status === "error") && (
                  <button
                    type="button"
                    onClick={() => removeEntry(entry)}
                    disabled={
                      isBusy ||
                      confirming ||
                      entry.removing ||
                      removingId === entry.id
                    }
                    className="shrink-0 px-3 py-3 text-sm font-medium text-chef-text-muted transition hover:text-red-700 disabled:opacity-40"
                    aria-label={`Remove ${entry.filename}`}
                    title="Remove"
                  >
                    {entry.removing || removingId === entry.id ? (
                      <LoadingSpinner className="h-4 w-4" />
                    ) : (
                      "✕"
                    )}
                  </button>
                )}
                </div>

                {entry.result && entry.expanded && (
                  <div className="border-t border-chef-border px-4 pb-3">
                    <table className="mt-2 w-full text-left text-sm">
                      <thead className="text-chef-text-muted">
                        <tr>
                          <th className="px-1 py-1.5 font-medium">Item</th>
                          <th className="px-1 py-1.5 font-medium">Qty</th>
                          <th className="px-1 py-1.5 font-medium">In kitchen?</th>
                          <th className="px-1 py-1.5 font-medium">Sure?</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entry.result.lines.map((line, i) => (
                          <tr key={i} className="border-t border-chef-border">
                            <td className="px-1 py-1.5 text-chef-text">
                              {line.normalizedName ?? line.rawName}
                            </td>
                            <td className="px-1 py-1.5 text-chef-text-muted">
                              {line.quantity} {line.unit}
                            </td>
                            <td className="px-1 py-1.5">
                              {line.matchedIngredientSlug || line.matchedMenuItemSlug ? (
                                <span className="text-chef-sage">Yes</span>
                              ) : (
                                <span className="text-chef-amber">New</span>
                              )}
                            </td>
                            <td className="px-1 py-1.5 text-chef-text-muted">
                              {Math.round(line.confidence * 100)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!stagingOnly && historyByDate && Object.keys(historyByDate).length > 0 && (
        <div className="mt-5 border-t border-chef-border pt-4">
          <h3 className="text-sm font-semibold text-chef-text">Recent uploads by date</h3>
          <p className="mt-0.5 text-xs text-chef-text-muted">Last 5 saved per type</p>
          <div className="mt-3 space-y-3">
            {Object.entries(historyByDate)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([date, group]) => {
                const bills =
                  billType === "supplier" ? group.supplier : (group.customer ?? []);
                if (!bills?.length) return null;
                return (
                  <div key={date} className="rounded-lg bg-chef-muted/50 px-3 py-2">
                    <p className="text-sm font-medium text-chef-text">{date}</p>
                    <ul className="mt-1 space-y-1">
                      {bills.map((bill) => (
                        <li
                          key={bill.billId}
                          className="flex flex-wrap items-center justify-between gap-2 text-sm text-chef-text-muted"
                        >
                          <span className="truncate">{bill.filename}</span>
                          <span className="shrink-0">
                            {bill.status === "confirmed" ? "Processed" : "Ready"}
                            <a
                              href={billFileHref(bill.billId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-1 text-chef-sage underline"
                            >
                              · File
                            </a>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
