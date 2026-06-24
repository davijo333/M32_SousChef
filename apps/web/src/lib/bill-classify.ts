import { detectBillTypeHeuristic } from "@/lib/bill-filename";
import type { ChatUploadBillType } from "@/lib/chat-upload-intent";

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";

export type BillClassification = {
  billType: ChatUploadBillType;
  confidence: number;
  reason: string;
};

export async function classifyBillFile(file: File): Promise<BillClassification> {
  const heuristic = detectBillTypeHeuristic(file.name);
  if (heuristic && heuristic.confidence >= 0.94) {
    return heuristic;
  }

  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${AGENT_URL}/classify-bill`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    const data = (await res.json()) as {
      billType?: string;
      confidence?: number;
      reason?: string;
    };
    return {
      billType: data.billType === "customer" ? "customer" : "supplier",
      confidence: Number(data.confidence ?? 0.7),
      reason: data.reason?.trim() || "document content",
    };
  } catch {
    if (heuristic) return heuristic;
    return {
      billType: "supplier",
      confidence: 0.5,
      reason: "assumed purchase order — say SO if this is a sales receipt",
    };
  }
}
