import { classifyBillFile } from "@backend/services/bills/bill-classify";
import {
  messageOverridesBillType,
  type ChatUploadBillType,
} from "@backend/services/chat/chat-upload-intent";

export type { ChatUploadBillType };

export type ChatBillUploadEntry = {
  id: string;
  filename: string;
  billType: ChatUploadBillType;
  status: "queued" | "classifying" | "parsing" | "parsed" | "error";
  error?: string;
  billId?: string;
  vendor?: string;
  classificationReason?: string;
  classificationConfidence?: number;
};

export type ChatUploadBillSlice = {
  billType: ChatUploadBillType;
  ready: number;
  failed: number;
  filenames: string[];
  readyBillIds: string[];
  reasons?: string[];
};

export type ChatUploadBatchPayload = {
  state: "ready" | "error";
  total: number;
  ready: number;
  failed: number;
  slices: ChatUploadBillSlice[];
  billType?: ChatUploadBillType;
  identifications?: Array<{
    filename: string;
    billType: ChatUploadBillType;
    reason: string;
    confidence: number;
  }>;
};

const PARSE_TIMEOUT_MS = 95_000;

function entryId() {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
          ? "Processing timed out — try fewer files at once."
          : `Server returned an empty response (${res.status}).`,
    };
  }
  try {
    return { data: JSON.parse(text) as T };
  } catch {
    return { data: null, parseError: `Could not read server response (${res.status}).` };
  }
}

function buildSlices(entries: ChatBillUploadEntry[]): ChatUploadBillSlice[] {
  const types: ChatUploadBillType[] = ["supplier", "customer"];
  return types
    .map((billType) => {
      const typed = entries.filter((entry) => entry.billType === billType);
      if (!typed.length) return null;
      const ready = typed.filter((entry) => entry.status === "parsed");
      const failed = typed.filter((entry) => entry.status === "error");
      return {
        billType,
        ready: ready.length,
        failed: failed.length,
        filenames: typed.map((entry) => entry.filename),
        readyBillIds: ready.map((entry) => entry.billId).filter(Boolean) as string[],
        reasons: ready
          .map((entry) => entry.classificationReason)
          .filter(Boolean) as string[],
      };
    })
    .filter(Boolean) as ChatUploadBillSlice[];
}

function toPayload(entries: ChatBillUploadEntry[]): ChatUploadBatchPayload {
  const slices = buildSlices(entries);
  const ready = entries.filter((entry) => entry.status === "parsed").length;
  const failed = entries.filter((entry) => entry.status === "error").length;
  const state: ChatUploadBatchPayload["state"] =
    ready === 0 && failed > 0 ? "error" : "ready";
  const activeSlices = slices.filter((slice) => slice.ready > 0 || slice.failed > 0);
  const parsed = entries.filter((entry) => entry.status === "parsed");

  return {
    state,
    total: entries.length,
    ready,
    failed,
    slices: activeSlices,
    billType: activeSlices.length === 1 ? activeSlices[0].billType : undefined,
    identifications: parsed.map((entry) => ({
      filename: entry.filename,
      billType: entry.billType,
      reason: entry.classificationReason ?? "identified from document",
      confidence: entry.classificationConfidence ?? 0.7,
    })),
  };
}

export function batchHasMixedTypes(batch: ChatUploadBatchPayload): boolean {
  const readyTypes = new Set(
    batch.slices.filter((slice) => slice.ready > 0).map((slice) => slice.billType)
  );
  return readyTypes.size > 1;
}

function formatIdentificationLines(batch: ChatUploadBatchPayload): string[] {
  return (batch.identifications ?? []).map((row) => {
    const label = row.billType === "supplier" ? "purchase order" : "sales receipt";
    return `- **${row.filename}** → ${label} (${row.reason})`;
  });
}

export function formatMixedUploadCallout(batch: ChatUploadBatchPayload): string {
  const purchase = batch.slices.find((slice) => slice.billType === "supplier" && slice.ready > 0);
  const sales = batch.slices.find((slice) => slice.billType === "customer" && slice.ready > 0);
  const idLines = formatIdentificationLines(batch);

  const parts: string[] = [];
  if (purchase) {
    parts.push(
      `**${purchase.ready}** purchase order${purchase.ready === 1 ? "" : "s"}`
    );
  }
  if (sales) {
    parts.push(`**${sales.ready}** sales receipt${sales.ready === 1 ? "" : "s"}`);
  }

  let note = `I identified ${parts.join(" and ")} in your attachments.`;
  if (idLines.length) {
    note += `\n${idLines.join("\n")}`;
  }
  if (batch.failed > 0) {
    note += `\n${batch.failed} file${batch.failed === 1 ? "" : "s"} could not be parsed.`;
  }
  if (batchHasMixedTypes(batch)) {
    note +=
      "\n\nSame order as Upload orders: **purchase orders first** (Inventory), then **sales receipts** (Business). Say **go ahead** or **confirm** to process.";
  } else if (batch.ready > 0) {
    note += "\n\nSay **go ahead** or **confirm** when you want me to process them.";
  }
  return note;
}

export type ChatBillQueueCallbacks = {
  onEntriesChange: (entries: ChatBillUploadEntry[]) => void;
  onWorkStart: (billType: ChatUploadBillType) => void;
  onWorkEnd: (billType: ChatUploadBillType) => void;
};

/** Classify each attachment, then parse with the detected bill type. */
export async function runChatMixedBillUploadQueue(
  files: File[],
  message: string,
  callbacks: ChatBillQueueCallbacks
): Promise<ChatUploadBatchPayload> {
  if (!files.length) {
    throw new Error("No files to upload.");
  }

  const messageOverride = messageOverridesBillType(message);
  const entries: ChatBillUploadEntry[] = files.map((file) => ({
    id: entryId(),
    filename: file.name,
    billType: messageOverride ?? "supplier",
    status: "queued",
  }));

  callbacks.onEntriesChange([...entries]);
  const activeTypes = new Set<ChatUploadBillType>();

  try {
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      let billType: ChatUploadBillType = messageOverride ?? "supplier";
      let classificationReason = messageOverride ? "chef message" : "";
      let classificationConfidence = messageOverride ? 1 : 0;

      entries[i] = { ...entries[i], status: "classifying" };
      callbacks.onEntriesChange([...entries]);

      if (!messageOverride) {
        const classified = await classifyBillFile(file);
        billType = classified.billType;
        classificationReason = classified.reason;
        classificationConfidence = classified.confidence;
      }

      entries[i] = {
        ...entries[i],
        billType,
        classificationReason,
        classificationConfidence,
        status: "parsing",
      };
      callbacks.onEntriesChange([...entries]);

      if (!activeTypes.has(billType)) {
        callbacks.onWorkStart(billType);
        activeTypes.add(billType);
      }

      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);

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
          billId?: string;
          vendor?: string;
        }>(res);

        if (parseError || !data?.billId) {
          entries[i] = {
            ...entries[i],
            status: "error",
            error: parseError ?? data?.error ?? `Could not parse ${file.name}`,
          };
        } else if (!res.ok) {
          entries[i] = {
            ...entries[i],
            status: "error",
            error: data.error ?? `Could not parse ${file.name}`,
          };
        } else {
          entries[i] = {
            ...entries[i],
            status: "parsed",
            billId: data.billId,
            vendor: data.vendor,
          };
        }
      } catch (err) {
        entries[i] = {
          ...entries[i],
          status: "error",
          error:
            err instanceof Error && err.name === "AbortError"
              ? "Parse timed out"
              : "Network error",
        };
      } finally {
        window.clearTimeout(timer);
        callbacks.onEntriesChange([...entries]);
      }
    }

    return toPayload(entries);
  } finally {
    for (const billType of activeTypes) {
      callbacks.onWorkEnd(billType);
    }
  }
}

export function batchProgressLabel(entries: ChatBillUploadEntry[]): string {
  const total = entries.length;
  if (!total) return "";
  const parsed = entries.filter((entry) => entry.status === "parsed").length;
  const classifying = entries.some((entry) => entry.status === "classifying");
  const parsing = entries.some((entry) => entry.status === "parsing");
  const failed = entries.filter((entry) => entry.status === "error").length;
  if (classifying) {
    return `Identifying ${parsed + 1} of ${total}…`;
  }
  if (parsing) {
    return `Parsing ${parsed + 1} of ${total}…`;
  }
  if (failed && parsed) {
    return `${parsed} ready, ${failed} failed`;
  }
  if (failed) {
    return `${failed} failed to parse`;
  }
  return `${parsed} of ${total} ready`;
}
