import type { AgentTabId } from "@/lib/agent-icons";
import { detectUploadConfirm } from "@/lib/chat-upload-intent";
import {
  CHAT_ASSISTANT_NAMES,
  type DashboardChatContext,
} from "@/lib/dashboard-chat";

export type SpecialistHandoffTarget = Exclude<DashboardChatContext, "head">;

const SPECIALIST_TARGETS: SpecialistHandoffTarget[] = ["create", "inventory", "business"];

export function isSpecialistHandoffTarget(value: string): value is SpecialistHandoffTarget {
  return SPECIALIST_TARGETS.includes(value as SpecialistHandoffTarget);
}

const HANDOFF_PATTERNS: Record<SpecialistHandoffTarget, RegExp[]> = {
  create: [
    /\b(creative|create)\s+agent\b/i,
    /\b(connect|direct|hand\s*off|transfer|switch|route)\b.*\b(creative|create)\b/i,
    /\b(talk|speak)\s+(to|with)\s+(the\s+)?(creative|create)(\s+agent)?\b/i,
    /\b(let|have)\s+me\s+(talk|speak)\s+(to|with)\b.*\b(creative|create)\b/i,
  ],
  inventory: [
    /\binventory\s+agent\b/i,
    /\b(connect|direct|hand\s*off|transfer|switch|route)\b.*\binventory\b/i,
    /\b(talk|speak)\s+(to|with)\s+(the\s+)?inventory(\s+agent)?\b/i,
  ],
  business: [
    /\bbusiness\s+agent\b/i,
    /\b(connect|direct|hand\s*off|transfer|switch|route)\b.*\bbusiness\b/i,
    /\b(talk|speak)\s+(to|with)\s+(the\s+)?business(\s+agent)?\b/i,
  ],
};

function agentMentionedInAssistant(
  content: string,
  target: SpecialistHandoffTarget
): boolean {
  if (target === "create") return /\bCreative Agent\b/i.test(content);
  if (target === "inventory") return /\bInventory Agent\b/i.test(content);
  return /\bBusiness Agent\b/i.test(content);
}

export function detectAgentHandoffFromMessage(message: string): SpecialistHandoffTarget | null {
  const trimmed = message.trim();
  if (!trimmed) return null;

  for (const target of Object.keys(HANDOFF_PATTERNS) as SpecialistHandoffTarget[]) {
    if (HANDOFF_PATTERNS[target].some((pattern) => pattern.test(trimmed))) {
      return target;
    }
  }
  return null;
}

export function detectHandoffFromConversation(
  message: string,
  recentMessages: Array<{ role: string; content: string }>,
  options?: { skipIfUploadConfirm?: boolean }
): SpecialistHandoffTarget | null {
  const trimmed = message.trim();
  if (!trimmed) return null;

  if (options?.skipIfUploadConfirm && detectUploadConfirm(trimmed)) {
    return null;
  }

  const direct = detectAgentHandoffFromMessage(trimmed);
  if (direct) return direct;

  const lastAssistant = [...recentMessages].reverse().find((m) => m.role === "assistant");
  if (!lastAssistant) return null;

  const confirms =
    /\b(direct|connect|yes|yeah|sure|ok|please|go ahead|do it|hand off)\b/i.test(trimmed);
  const asksConnected = /\b(is it|are you|am i)\s+connected\b/i.test(trimmed);

  if (!confirms && !asksConnected) return null;

  const targets: SpecialistHandoffTarget[] = ["create", "inventory", "business"];
  for (const target of targets) {
    if (agentMentionedInAssistant(lastAssistant.content, target)) {
      return target;
    }
  }

  return null;
}

type UploadBatchHandoffInput = {
  slices?: Array<{ billType: "supplier" | "customer"; ready: number }>;
};

/** After the chef confirms bill processing, route to the owning specialist. */
export function detectUploadBatchHandoffTarget(
  uploadBatch: UploadBatchHandoffInput | undefined,
  confirmUpload: boolean
): SpecialistHandoffTarget | null {
  if (!confirmUpload) return null;

  const ready = uploadBatch?.slices?.filter((slice) => slice.ready > 0) ?? [];
  if (ready.length) {
    if (ready.some((slice) => slice.billType === "supplier")) return "inventory";
    if (ready.some((slice) => slice.billType === "customer")) return "business";
    return null;
  }

  return null;
}

export function handoffToDashboardSection(
  target: SpecialistHandoffTarget
): "inventory" | "business" | "create" {
  return target;
}

const SUGGESTED_HANDOFF_PATTERNS: Record<SpecialistHandoffTarget, RegExp[]> = {
  create: [
    /\bCreative Agent\b/i,
    /\b(creative|create)\s+agent\b/i,
    /\bCreate\s+section\b/i,
    /\bDashboard\b[^.]{0,80}\bCreate\b/i,
  ],
  inventory: [
    /\bInventory Agent\b/i,
    /\binventory\s+agent\b/i,
    /\bInventory\s+section\b/i,
    /\bDashboard\b[^.]{0,80}\bInventory\b/i,
  ],
  business: [
    /\bBusiness Agent\b/i,
    /\bbusiness\s+agent\b/i,
    /\bBusiness\s+section\b/i,
    /\bDashboard\b[^.]{0,80}\bBusiness\b/i,
  ],
};

/** When an assistant message routes the chef to a specialist, offer a Connect button. */
export function detectSuggestedAgentHandoff(content: string): SpecialistHandoffTarget | null {
  const trimmed = content.trim();
  if (!trimmed || /you're now connected with/i.test(trimmed)) return null;

  let best: SpecialistHandoffTarget | null = null;
  let bestScore = 0;

  for (const target of SPECIALIST_TARGETS) {
    const score = SUGGESTED_HANDOFF_PATTERNS[target].filter((pattern) =>
      pattern.test(trimmed)
    ).length;
    if (score > bestScore) {
      bestScore = score;
      best = target;
    }
  }

  return best;
}

export function connectAgentButtonLabel(target: SpecialistHandoffTarget): string {
  return `Connect to ${CHAT_ASSISTANT_NAMES[target]}`;
}

export function dashboardChatContextToBrandAgent(context: DashboardChatContext): AgentTabId {
  if (context === "head") return "head_chef";
  if (context === "create") return "creative";
  return context;
}
