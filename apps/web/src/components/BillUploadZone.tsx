"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Play,
  RotateCw,
  UploadCloud,
  X,
} from "lucide-react";
import type { NewCatalogItem } from "@backend/services/catalog/extract-new-items";
import { validateBillFilenameForZone } from "@backend/services/bills/bill-filename";
import { useOrderWorkOptional, type OrderBillType } from "@/components/OrderWorkProvider";
import { Tooltip } from "@/components/ui/Tooltip";

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
  status: "queued" | "parsing" | "parsed" | "processing" | "error" | "confirmed";
  error?: string;
  result?: ParseResult;
  expanded: boolean;
  removing?: boolean;
};

function entryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function readJsonResponse<T extends Record<string, unknown>>(
  res: Response
): Promise<{ data: T | null; parseError?: string }> {
  const text = await res.text();
  if (!text.trim()) {
    return {
      data: null,
      parseError:
        res.status === 504 || res.status === 408
          ? "Processing timed out — try fewer orders at a time, then check Kitchen control."
          : `Server returned an empty response (${res.status}). Processing may still be running — refresh and check Kitchen control.`,
    };
  }
  try {
    return { data: JSON.parse(text) as T };
  } catch {
    return {
      data: null,
      parseError: `Could not read server response (${res.status}). Try again.`,
    };
  }
}

function billLabelFromTitle(title: string, billType: "supplier" | "customer") {
  if (billType === "supplier") return "purchase orders";
  return "sales orders";
}

const PARSE_TIMEOUT_MS = 95_000;
/** Max unique files in the upload queue (queued, parsing, or ready to process). */
const MAX_STAGED_UPLOADS = 10;

const STAGING_STATUSES = new Set<BillEntry["status"]>(["queued", "parsing", "parsed"]);

function normalizeBillFilename(name: string) {
  return name.trim().toLowerCase();
}

function countStagedEntries(list: BillEntry[]) {
  return list.filter((e) => STAGING_STATUSES.has(e.status)).length;
}

function stagedFilenameSet(list: BillEntry[]) {
  return new Set(
    list
      .filter((e) => STAGING_STATUSES.has(e.status))
      .map((e) => normalizeBillFilename(e.filename))
  );
}

function billFileHref(billId: string) {
  return `/api/bills/${billId}/file`;
}

type ProcessStats = {
  totalUpdated: number;
  totalNewAdded: number;
  billsProcessed: number;
};

function LoadingSpinner({ className = "h-4 w-4" }: { className?: string }) {
  return <Loader2 className={`animate-spin text-chef-sage ${className}`} aria-hidden />;
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
  /** Block new uploads while this or another order tab is busy */
  uploadLocked?: boolean;
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
  uploadLocked,
  onProcessed,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const entriesRef = useRef<BillEntry[]>([]);
  const cancelledRef = useRef<Set<string>>(new Set());
  const abortRef = useRef<Map<string, AbortController>>(new Map());
  const queueRef = useRef<string[]>([]);
  const runningRef = useRef(false);
  const orderWork = useOrderWorkOptional();
  const workBillType: OrderBillType = billType;

  const [entries, setEntries] = useState<BillEntry[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [activeFilename, setActiveFilename] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [batchMsg, setBatchMsg] = useState("");
  const [batchError, setBatchError] = useState("");
  const [processStats, setProcessStats] = useState<ProcessStats | null>(null);
  const [uploading, setUploading] = useState(false);
  const billLabel = billLabelFromTitle(title, billType);

  function setEntriesLive(next: BillEntry[]) {
    entriesRef.current = next;
    setEntries(next);
    refreshProgress();
  }

  function isCancelled(id: string) {
    return cancelledRef.current.has(id);
  }

  function refreshProgress() {
    const list = entriesRef.current;
    const total = list.length;
    if (!total) {
      setProgress({ current: 0, total: 0 });
      return;
    }
    const done = list.filter((e) => e.status === "parsed" || e.status === "confirmed").length;
    const parsing = list.some((e) => e.status === "parsing");
    setProgress({
      current: parsing ? Math.min(done + 1, total) : done,
      total,
    });
  }

  function beginWork() {
    orderWork?.startWork(workBillType);
    onProcessingChange?.(true);
  }

  function finishWork() {
    orderWork?.endWork(workBillType);
    onProcessingChange?.(false);
  }

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  // Non-staging zones may restore saved bills from the server once on load.
  useEffect(() => {
    if (stagingOnly || !initialBills?.length) return;
    const pending = initialBills.filter((b) => b.status !== "confirmed");
    if (!pending.length) return;
    setEntriesLive(pending.map(billToEntry));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once when initialBills arrives
  }, [stagingOnly, initialBills?.length]);

  useEffect(() => {
    if (!processedBillIds?.length) return;
    const idSet = new Set(processedBillIds);
    setEntriesLive(
      entriesRef.current.map((e) =>
        e.result && idSet.has(e.result.billId) ? { ...e, status: "confirmed" as const } : e
      )
    );
  }, [processedBillIds]);

  // Recover parsed bills still on the server (e.g. after refresh) — canceled bills are deleted server-side.
  useEffect(() => {
    if (!stagingOnly) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/bills/session");
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as {
        supplier?: SavedBill[];
        customer?: SavedBill[];
      };
      const pending = (
        (billType === "supplier" ? data.supplier : data.customer) ?? []
      ).filter((b) => b.status === "pending_review");
      if (!pending.length) return;
      const prev = entriesRef.current;
      const existingBillIds = new Set(
        prev.map((e) => e.result?.billId).filter(Boolean) as string[]
      );
      const restored = pending
        .filter((b) => !existingBillIds.has(b.billId))
        .map(billToEntry);
      if (restored.length) setEntriesLive([...restored, ...prev]);
    })();
    return () => {
      cancelled = true;
    };
  }, [stagingOnly, billType]);

  function updateEntry(id: string, patch: Partial<BillEntry>) {
    setEntriesLive(entriesRef.current.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function toggleExpanded(id: string) {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, expanded: !e.expanded } : e))
    );
  }

  async function deleteBill(billId: string) {
    try {
      const res = await fetch(`/api/bills/${billId}`, { method: "DELETE" });
      if (res.ok) onBillRemoved?.(billId);
    } catch {
      /* best-effort cleanup */
    }
  }

  async function parseFile(
    file: File,
    id: string
  ): Promise<{
    result: ParseResult;
    newCatalogItems: { ingredients: NewCatalogItem[]; dishes: NewCatalogItem[] };
  } | null> {
    if (isCancelled(id)) return null;

    updateEntry(id, { status: "parsing" });
    if (isCancelled(id)) return null;

    const controller = new AbortController();
    abortRef.current.set(id, controller);
    const timer = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("billType", billType);

      const res = await fetch("/api/bills/parse", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      const { data, parseError } = await readJsonResponse<{
        error?: string;
        newCatalogItems?: { ingredients: NewCatalogItem[]; dishes: NewCatalogItem[] };
      } & ParseResult>(res);

      if (isCancelled(id)) {
        if (data?.billId) void deleteBill(data.billId);
        return null;
      }

      if (parseError || !data) {
        updateEntry(id, { status: "error", error: parseError ?? "Could not read this order" });
        return null;
      }

      if (res.status === 401) {
        updateEntry(id, {
          status: "error",
          error: "Session expired — please log in again",
          file: undefined,
        });
        return null;
      }

      if (!res.ok) {
        updateEntry(id, { status: "error", error: data.error ?? "Could not read this order" });
        return null;
      }

      setEntriesLive(
        entriesRef.current.map((e) =>
          e.id === id
            ? { ...e, status: "parsed" as const, result: data, expanded: false, file: undefined }
            : e
        )
      );
      return {
        result: data as ParseResult,
        newCatalogItems: (data.newCatalogItems ?? {
          ingredients: [],
          dishes: [],
        }) as { ingredients: NewCatalogItem[]; dishes: NewCatalogItem[] },
      };
    } catch (err) {
      if (isCancelled(id)) return null;
      if (err instanceof Error && err.name === "AbortError") return null;
      updateEntry(id, { status: "error", error: "Network error" });
      return null;
    } finally {
      abortRef.current.delete(id);
      clearTimeout(timer);
    }
  }

  function enqueueIds(ids: string[]) {
    const pending = ids.filter((id) => !isCancelled(id));
    if (!pending.length) return;
    queueRef.current.push(...pending);
    void runQueue();
  }

  async function runQueue() {
    if (runningRef.current) return;
    runningRef.current = true;
    setUploading(true);
    beginWork();

    try {
      while (queueRef.current.length > 0) {
        const id = queueRef.current.shift()!;
        if (isCancelled(id)) continue;

        const entry = entriesRef.current.find((e) => e.id === id);
        if (!entry?.file) {
          updateEntry(id, {
            status: "error",
            error: "Upload interrupted — attach this file again",
            file: undefined,
          });
          continue;
        }

        setActiveFilename(entry.filename);
        refreshProgress();

        const parsed = await parseFile(entry.file, id);
        if (parsed?.newCatalogItems) {
          const hasNew =
            parsed.newCatalogItems.ingredients.length > 0 ||
            parsed.newCatalogItems.dishes.length > 0;
          if (hasNew) onNewItemsDiscovered?.(parsed.newCatalogItems, billType);
        }
      }
    } finally {
      runningRef.current = false;
      setUploading(false);
      setActiveFilename("");
      refreshProgress();
      finishWork();
      if (queueRef.current.length > 0) void runQueue();
    }
  }

  function queueFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length || uploadLocked || confirming) return;

    setBatchMsg("");
    setBatchError("");
    setProcessStats(null);

    const existing = entriesRef.current;
    const stagedNames = stagedFilenameSet(existing);
    const stagedCount = countStagedEntries(existing);

    const accepted: BillEntry[] = [];
    const toRetry: { id: string; file: File }[] = [];
    const rejected: BillEntry[] = [];
    const batchNames = new Set<string>();

    for (const file of list) {
      const norm = normalizeBillFilename(file.name);

      if (stagedNames.has(norm) || batchNames.has(norm)) {
        continue;
      }

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

      const existingError = existing.find(
        (e) => e.status === "error" && normalizeBillFilename(e.filename) === norm
      );
      if (existingError) {
        toRetry.push({ id: existingError.id, file });
        batchNames.add(norm);
        continue;
      }

      if (stagedCount + accepted.length >= MAX_STAGED_UPLOADS) {
        continue;
      }

      batchNames.add(norm);
      accepted.push({
        id: entryId(),
        filename: file.name,
        file,
        status: "queued",
        expanded: false,
      });
    }

    let next = existing;

    if (toRetry.length) {
      for (const { id } of toRetry) {
        const billId = existing.find((e) => e.id === id)?.result?.billId;
        if (billId) void deleteBill(billId);
      }
      const retryById = new Map(toRetry.map((r) => [r.id, r.file]));
      next = next.map((e) => {
        const file = retryById.get(e.id);
        if (!file) return e;
        return {
          ...e,
          file,
          status: "queued" as const,
          error: undefined,
          result: undefined,
          expanded: false,
        };
      });
    }

    if (accepted.length) {
      next = [...accepted, ...next];
    }
    if (rejected.length) {
      next = [...rejected, ...next];
    }

    if (accepted.length || toRetry.length || rejected.length) {
      setEntriesLive(next);
      enqueueIds([...accepted.map((e) => e.id), ...toRetry.map((r) => r.id)]);
    }

    if (rejected.length) {
      setBatchError(
        rejected.length === 1
          ? rejected[0].error!
          : `${rejected.length} files rejected — use PDF or PNG in the correct tab.`
      );
    }

    if (inputRef.current) inputRef.current.value = "";
  }

  async function retryEntry(entry: BillEntry) {
    if (!entry.file || runningRef.current) return;
    updateEntry(entry.id, { status: "queued", error: undefined });
    enqueueIds([entry.id]);
  }

  function cancelEntry(entry: BillEntry) {
    if (entry.status === "processing" || entry.status === "confirmed") return;

    const billId = entry.result?.billId;
    cancelledRef.current.add(entry.id);
    abortRef.current.get(entry.id)?.abort();
    queueRef.current = queueRef.current.filter((id) => id !== entry.id);
    setEntriesLive(entriesRef.current.filter((e) => e.id !== entry.id));

    if (billId) void deleteBill(billId);
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
    const toProcessIds = new Set(toProcess.map((e) => e.id));
    setEntries((prev) =>
      prev.map((e) =>
        toProcessIds.has(e.id) ? { ...e, status: "processing" as const } : e
      )
    );
    beginWork();
    setProgress({ current: 0, total: toProcess.length });
    setActiveFilename("");

    const billIds = toProcess.map((e) => e.result!.billId);

    try {
      const res = await fetch("/api/bills/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billIds }),
      });

      const { data, parseError } = await readJsonResponse<{
        error?: string;
        message?: string;
        results?: Array<{ billId: string; ok: boolean; error?: string }>;
        updatedIngredients?: number;
        createdIngredients?: number;
        confirmed?: number;
        failed?: number;
        newCatalogItems?: { ingredients: NewCatalogItem[]; dishes: NewCatalogItem[] };
        missingIngredients?: NewCatalogItem[];
      }>(res);

      if (parseError || !data) {
        setBatchError(parseError ?? "Processing failed — no response from server");
        setEntries((prev) =>
          prev.map((e) =>
            e.status === "processing" ? { ...e, status: "parsed" as const } : e
          )
        );
        return;
      }

      if (!res.ok) {
        setBatchError(
          data.error?.includes("E11000")
            ? "An ingredient already exists in your kitchen — try Process again."
            : (data.error ?? "Processing failed")
        );
        setEntries((prev) =>
          prev.map((e) =>
            e.status === "processing" ? { ...e, status: "parsed" as const } : e
          )
        );
        return;
      }

      const results = data.results ?? [];
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

      if ((data.failed ?? 0) > 0) {
        const failedRows = results.filter((r) => !r.ok);
        const onlyAlreadySaved = failedRows.every((r) => r.error === alreadyProcessed);
        if (!onlyAlreadySaved) {
          setBatchError(data.message ?? "Some orders failed to process.");
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
    } catch {
      setBatchError(
        "Network error while processing — check Kitchen control in case inventory updated, then retry if needed."
      );
      setEntries((prev) =>
        prev.map((e) =>
          e.status === "processing" ? { ...e, status: "parsed" as const } : e
        )
      );
    } finally {
      setConfirming(false);
      finishWork();
      setActiveFilename("");
    }
  }

  const visibleEntries = stagingOnly
    ? entries.filter((e) => e.status !== "confirmed")
    : entries;

  const queuedCount = visibleEntries.filter((e) => e.status === "queued").length;
  const parsingCount = visibleEntries.filter((e) => e.status === "parsing").length;
  const processingCount = visibleEntries.filter((e) => e.status === "processing").length;
  const stagedCount = visibleEntries.filter((e) => STAGING_STATUSES.has(e.status)).length;
  const parsedCount = visibleEntries.filter((e) => e.status === "parsed").length;
  const confirmedCount = entries.filter((e) => e.status === "confirmed").length;
  const errorCount = visibleEntries.filter((e) => e.status === "error").length;
  const retryCount = visibleEntries.filter((e) => e.status === "error" && e.file).length;

  const allReady =
    visibleEntries.length > 0 &&
    visibleEntries.every((e) => e.status === "parsed") &&
    !uploading &&
    !confirming;

  const isBusy = uploading || confirming || parsingCount > 0 || processingCount > 0;
  const atMaxStaged = stagedCount >= MAX_STAGED_UPLOADS;
  const uploadsBlocked =
    confirming || processingCount > 0 || Boolean(uploadLocked) || atMaxStaged;

  return (
    <div className="sc-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-chef-text">{title}</h2>
      <p className="mt-1 text-base text-chef-text-muted">{description}</p>
      {requiresSupplierFirst && !supplierReady && (
        <p className="mt-2 rounded-xl border border-chef-amber/30 bg-chef-amber-light/40 px-3 py-2 text-sm text-chef-amber">
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
        disabled={uploadsBlocked}
        onClick={() => inputRef.current?.click()}
        className="mt-4 w-full rounded-lg border-2 border-dashed border-chef-sage/35 bg-chef-sage-light/30 p-5 text-base text-chef-text transition hover:border-chef-sage/60 hover:bg-chef-sage-light/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chef-sage/30 disabled:cursor-not-allowed disabled:opacity-50 sm:p-6"
      >
        {isBusy ? (
          <span className="flex flex-col items-center justify-center gap-2">
            <LoadingSpinner className="h-6 w-6" />
            <span className="font-medium">
              {confirming || processingCount > 0
                ? `Processing ${billLabel}…`
                : progress.total > 1
                  ? `Uploading ${billLabel} — file ${progress.current} of ${progress.total}`
                  : `Uploading ${billLabel}…`}
            </span>
            {activeFilename && (
              <span className="max-w-full truncate text-sm text-chef-text-muted">{activeFilename}</span>
            )}
          </span>
        ) : uploadLocked ? (
          <span className="flex flex-col items-center justify-center gap-2 text-chef-text-muted">
            <span className="font-medium">Uploads paused</span>
            <span className="text-sm">Wait for the other tab to finish.</span>
          </span>
        ) : atMaxStaged ? (
          <span className="flex flex-col items-center justify-center gap-1 text-chef-text-muted">
            <span className="font-medium">Maximum {MAX_STAGED_UPLOADS} files</span>
            <span className="text-sm">Process or remove files to add more.</span>
          </span>
        ) : (
          <span className="flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-3">
            <UploadCloud className="h-6 w-6 text-chef-sage" aria-hidden />
            <span>
              <span className="font-semibold text-chef-sage">Choose files</span>
              <span className="text-chef-text-muted">
                {" "}
                — PDF or photo, up to {MAX_STAGED_UPLOADS} at a time
                {stagedCount > 0 ? ` (${stagedCount}/${MAX_STAGED_UPLOADS})` : ""}
              </span>
            </span>
          </span>
        )}
      </button>

      {isBusy && (
        <div
          className="mt-3 flex items-center gap-3 rounded-lg border border-chef-border bg-chef-muted/40 px-4 py-3 text-base text-chef-text"
          role="status"
          aria-live="polite"
        >
          <LoadingSpinner className="h-5 w-5 shrink-0" />
          <span className="min-w-0 truncate">
            {confirming
              ? "Processing orders and updating inventory…"
              : `Uploading ${billLabel}${activeFilename ? ` — ${activeFilename}` : "…"}`}
          </span>
        </div>
      )}

      {batchError && <p className="mt-3 text-base text-red-700">{batchError}</p>}
      {batchMsg && <p className="mt-3 text-base text-chef-sage">{batchMsg}</p>}

      {processStats && !stagingOnly && (
        <div
          className="mt-4 rounded-lg border border-chef-sage/40 bg-chef-sage/10 p-4"
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
              {processingCount > 0 && ` · ${processingCount} processing`}
              {parsedCount > 0 && ` · ${parsedCount} ready to process`}
              {!stagingOnly && confirmedCount > 0 && ` · ${confirmedCount} processed`}
              {retryCount > 0 && ` · ${retryCount} to retry`}
              {errorCount > retryCount && ` · ${errorCount - retryCount} invalid`}
            </span>
            {visibleEntries.length > 0 && (
              <Tooltip
                content={
                  allReady
                    ? "Apply parsed orders to inventory"
                    : "Wait until all files finish uploading"
                }
              >
                <button
                  type="button"
                  onClick={processAll}
                  disabled={
                    !allReady ||
                    confirming ||
                    (requiresSupplierFirst === true && supplierReady === false)
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-chef-sage px-4 py-2 text-sm font-medium text-white hover:bg-chef-sage/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {confirming ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Processing…
                    </>
                  ) : allReady ? (
                    <>
                      <Play className="h-4 w-4" aria-hidden />
                      Process ({parsedCount})
                    </>
                  ) : (
                    "Process"
                  )}
                </button>
              </Tooltip>
            )}
            {errorCount > 0 && (
              <Tooltip content="Remove invalid files from the queue">
                <button
                  type="button"
                  onClick={() =>
                    setEntries((prev) => prev.filter((e) => e.status !== "error"))
                  }
                  disabled={isBusy || confirming}
                  className="rounded-lg border border-chef-sage/50 px-3 py-1.5 text-sm font-medium text-chef-sage hover:bg-chef-sage-light/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear failed
                </button>
              </Tooltip>
            )}
          </div>

          <div className="max-h-80 space-y-2 overflow-y-auto">
            {visibleEntries.map((entry) => (
              <div
                key={entry.id}
                className={`rounded-lg border transition-colors ${
                  entry.status === "parsing" || entry.status === "processing"
                    ? "border-chef-sage/40 bg-chef-sage/10"
                    : entry.status === "error"
                      ? "border-chef-amber/30 bg-chef-amber-light/40"
                      : "border-chef-border bg-chef-muted/40"
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
                    {(entry.status === "queued" ||
                      entry.status === "parsing" ||
                      entry.status === "processing") && (
                      <p className="mt-1 flex items-center gap-2 text-sm text-chef-text-muted">
                        {(entry.status === "parsing" || entry.status === "processing") && (
                          <LoadingSpinner className="h-4 w-4 shrink-0" />
                        )}
                        {entry.status === "processing"
                          ? `Processing ${billLabel}…`
                          : entry.status === "parsing"
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
                    {(entry.status === "parsing" || entry.status === "processing") && (
                      <LoadingSpinner className="h-4 w-4" />
                    )}
                    {entry.status === "queued" && <span className="sc-badge-muted">Queued</span>}
                    {entry.status === "parsing" && <span className="sc-badge-muted">Uploading…</span>}
                    {entry.status === "processing" && <span className="sc-badge-muted">Processing…</span>}
                    {entry.status === "parsed" && <span className="sc-badge-amber">Ready</span>}
                    {entry.status === "confirmed" && <span className="sc-badge-sage">Processed</span>}
                    {entry.status === "error" && !entry.file && <span className="sc-badge-amber">Invalid</span>}
                    {entry.result &&
                      (entry.expanded ? (
                        <ChevronUp className="h-4 w-4" aria-hidden />
                      ) : (
                        <ChevronDown className="h-4 w-4" aria-hidden />
                      ))}
                  </span>
                </button>
                {entry.status === "error" && entry.file && (
                  <Tooltip content="Retry upload">
                    <button
                      type="button"
                      onClick={() => void retryEntry(entry)}
                      disabled={isBusy || confirming}
                      className="sc-icon-btn px-3 py-3 text-chef-sage hover:bg-chef-sage-light/60 hover:text-chef-sage-dark"
                      aria-label={`Retry ${entry.filename}`}
                    >
                      <RotateCw className="h-4 w-4" aria-hidden />
                    </button>
                  </Tooltip>
                )}
                {(entry.status === "queued" ||
                  entry.status === "parsing" ||
                  entry.status === "parsed" ||
                  entry.status === "error") && (
                  <Tooltip
                    content={
                      entry.status === "queued" || entry.status === "parsing"
                        ? "Cancel upload"
                        : "Remove from queue"
                    }
                  >
                    <button
                      type="button"
                      onClick={() => cancelEntry(entry)}
                      className="sc-icon-btn px-3 py-3 hover:text-red-700"
                      aria-label={
                        entry.status === "queued" || entry.status === "parsing"
                          ? `Cancel ${entry.filename}`
                          : `Remove ${entry.filename}`
                      }
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </Tooltip>
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
