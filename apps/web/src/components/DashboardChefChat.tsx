"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquarePlus, Minimize2, Paperclip, Send, X } from "lucide-react";
import { CreativeCueCard } from "@/components/CreativeCueCard";
import type { CreateCue } from "@backend/services/creative/create-cues";
import { cueToChatPrompt } from "@backend/services/creative/create-cues";
import {
  CHAT_ATTACHMENT_ACCEPT,
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_SESSIONS,
} from "@backend/services/chat/chat-retention";
import { CREATIVE_CUE_SELECT_EVENT } from "@backend/services/creative/creative-cue-events";
import {
  buildAssistantGreeting,
  CHAT_ASSISTANT_PROFILES,
  CHAT_PLACEHOLDER,
} from "@backend/services/agents/dashboard-chat";
import { renderChatMarkdown } from "@/lib/chat-markdown";
import { AgentBrandMark } from "@/components/BrandMark";
import { useOrderWorkOptional } from "@/components/OrderWorkProvider";
import type { AgentBrandAgent } from "@/lib/agent-icons";
import {
  batchProgressLabel,
  formatMixedUploadCallout,
  runChatMixedBillUploadQueue,
  type ChatBillUploadEntry,
  type ChatUploadBatchPayload,
} from "@backend/services/chat/chat-bill-upload-queue";
import {
  applyCatalogDraftCorrection,
  buildCatalogDraftFromChat,
  inferCatalogDraftFromThread,
  inferPricingSubjectDraftFromThread,
  type ChatCatalogDraftPayload,
} from "@backend/services/chat/chat-catalog-draft";
import { shouldParseAttachmentsAsBills } from "@backend/services/chat/chat-catalog-intent";
import {
  detectKitchenBuildConfirm,
  detectPantryAddZeroConfirm,
} from "@backend/services/chat/chat-recipe-build-intent";
import {
  detectPriceAdjustmentConfirm,
  detectSellPriceConfirm,
  threadAwaitingPriceConfirm,
} from "@backend/services/chat/chat-price-adjustment";
import {
  detectReorderThresholdConfirm,
  threadAwaitingReorderConfirm,
} from "@backend/services/chat/chat-reorder-adjustment";
import {
  threadAwaitingKitchenSaveConfirm,
  threadHasKitchenBuildInThread,
  threadHasRecipeDraft,
} from "@backend/services/chat/chat-recipe-draft";
import { detectUploadConfirm } from "@backend/services/chat/chat-upload-intent";
import {
  isRecipeBuildReadyToFinalize,
  type RecipeBuildPlanPayload,
} from "@backend/services/recipes/recipe-build-plan";
import { RecipeBuildPicker } from "@/components/RecipeBuildPicker";
import { Tooltip } from "@/components/ui/Tooltip";
import type { DashboardFinancePeriod } from "@backend/services/dashboard/dashboard-stats";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  activity?: {
    orchestrator: "head";
    consultedAgents: Array<"inventory" | "business" | "create">;
  } | null;
};

type ChatSession = {
  id: string;
  title: string;
  updatedAt: string;
};

type DashboardChefChatProps = {
  financeView?: DashboardFinancePeriod;
  showCues?: boolean;
  /** Section title already shows avatar + name — omit duplicate in chat chrome. */
  hideHeaderIdentity?: boolean;
  /** `dock` = fixed bottom bar; `floating` = opened from page FAB, closes back to icon. */
  variant?: "inline" | "dock" | "floating";
  showAttachments?: boolean;
  onRequestClose?: () => void;
};

function MinimizeChatButton({
  onClick,
  disabled = false,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip content="Minimize">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="sc-btn-secondary px-2.5 py-1.5 text-sm"
        aria-label="Minimize"
      >
        <Minimize2 className="h-3.5 w-3.5" aria-hidden />
      </button>
    </Tooltip>
  );
}

function sessionTabShellClass(active: boolean, equalWidth = false): string {
  return `flex w-full items-center rounded-md transition ${
    equalWidth ? "min-w-0 flex-1" : "max-w-[11rem]"
  } ${
    active ? "bg-chef-sage text-white" : "bg-chef-muted text-chef-text-muted hover:text-chef-text"
  }`;
}

function SessionTabsRow({
  sessions,
  activeSessionId,
  draftNewChat,
  deletingId,
  equalWidth,
  onSelect,
  onDelete,
}: {
  sessions: ChatSession[];
  activeSessionId: string | null;
  draftNewChat: boolean;
  deletingId: string | null;
  equalWidth?: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const tabCount = sessions.length + (draftNewChat ? 1 : 0);
  if (tabCount < 2) return null;

  return (
    <div className={`flex gap-1.5 ${equalWidth ? "w-full" : "flex-wrap"}`}>
      {sessions.slice(0, MAX_CHAT_SESSIONS).map((sessionRow) => (
        <SessionTab
          key={sessionRow.id}
          title={sessionRow.title}
          active={activeSessionId === sessionRow.id}
          deleting={deletingId === sessionRow.id}
          equalWidth={equalWidth}
          onSelect={() => onSelect(sessionRow.id)}
          onDelete={() => onDelete(sessionRow.id)}
        />
      ))}
      {draftNewChat && (
        <span
          className={`flex items-center rounded-md bg-chef-sage px-3 py-2 text-center text-sm font-medium text-white ${
            equalWidth ? "min-w-0 flex-1" : ""
          }`}
        >
          <span className="min-w-0 flex-1 truncate">New chat</span>
        </span>
      )}
    </div>
  );
}

function SessionTab({
  title,
  active,
  deleting,
  equalWidth = false,
  onSelect,
  onDelete,
}: {
  title: string;
  active: boolean;
  deleting: boolean;
  equalWidth?: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={sessionTabShellClass(active, equalWidth)}>
      <Tooltip content={title} className="min-w-0 flex-1 overflow-hidden">
        <button
          type="button"
          onClick={onSelect}
          disabled={deleting}
          className="block w-full truncate px-3 py-2 text-left text-sm font-medium"
        >
          {title}
        </button>
      </Tooltip>
      <Tooltip content="Delete chat">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          disabled={deleting}
          aria-label={`Delete chat: ${title}`}
          className={`sc-icon-btn mr-0.5 h-7 w-7 shrink-0 p-0 ${
            active ? "text-white/90 hover:bg-white/15 hover:text-white" : ""
          }`}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </Tooltip>
    </div>
  );
}

function hasUserMessages(messages: ChatMessage[]): boolean {
  return messages.some((message) => message.role === "user");
}

function chatContextAgent(): AgentBrandAgent {
  return "head_chef";
}

export function DashboardChefChat({
  financeView = "week",
  showCues = false,
  hideHeaderIdentity = false,
  variant = "inline",
  showAttachments: showAttachmentsProp = true,
  onRequestClose,
}: DashboardChefChatProps) {
  const { data: session, status } = useSession();
  const chefName = session?.user?.name ?? "Chef";
  const profile = CHAT_ASSISTANT_PROFILES.head;

  const [cues, setCues] = useState<CreateCue[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tryAskingPrompts, setTryAskingPrompts] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draftNewChat, setDraftNewChat] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");
  const [lastCreated, setLastCreated] = useState<string | null>(null);
  const [recipeBuildPlan, setRecipeBuildPlan] = useState<RecipeBuildPlanPayload | null>(null);
  const [catalogDraft, setCatalogDraft] = useState<ChatCatalogDraftPayload | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploadEntries, setUploadEntries] = useState<ChatBillUploadEntry[]>([]);
  const [parsingBatch, setParsingBatch] = useState(false);
  const orderWork = useOrderWorkOptional();

  const uploadLocked = Boolean(orderWork?.anyBusy || parsingBatch);

  const greeting = buildAssistantGreeting("head", chefName);

  const loadCues = useCallback(async () => {
    if (!showCues) return;
    try {
      const res = await fetch("/api/create/cues");
      if (!res.ok) return;
      const data = (await res.json()) as { cues: CreateCue[] };
      setCues(data.cues);
    } catch {
      // ignore
    }
  }, [showCues]);

  const loadPromptSuggestions = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: "head", agent: "head" });
      const res = await fetch(`/api/dashboard/chat-suggestions?${params}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        sampleQueries?: string[];
        tryAsking?: string[];
      };
      const queries = data.sampleQueries?.filter(Boolean) ?? data.tryAsking?.filter(Boolean) ?? [];
      setTryAskingPrompts(queries);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt: string }>).detail;
      if (!detail?.prompt) return;
      setInput(detail.prompt);
      setExpanded(true);
      queueMicrotask(() => focusChatInput());
    };
    window.addEventListener(CREATIVE_CUE_SELECT_EVENT, handler);
    return () => window.removeEventListener(CREATIVE_CUE_SELECT_EVENT, handler);
  }, []);

  const applyConversationPayload = useCallback(
    (data: {
      conversationId: string | null;
      conversations?: ChatSession[];
      messages: ChatMessage[];
    }, expandOnLoad = true) => {
      if (data.conversations) setSessions(data.conversations);
      setConversationId(data.conversationId);
      setDraftNewChat(false);
      if (data.messages.length > 0) {
        setMessages(data.messages);
        const recovered =
          inferCatalogDraftFromThread(
            data.messages.map((row) => ({ role: row.role, content: row.content }))
          ) ??
          inferPricingSubjectDraftFromThread(
            data.messages.map((row) => ({ role: row.role, content: row.content }))
          );
        setCatalogDraft(recovered ?? null);
        if (expandOnLoad) setExpanded(true);
      } else {
        setMessages([]);
        if (expandOnLoad) setExpanded(false);
      }
    },
    []
  );

  const loadConversation = useCallback(
    async (selectedId?: string | null, expandOnLoad?: boolean) => {
      try {
        const params = new URLSearchParams();
        if (selectedId) params.set("conversationId", selectedId);
        const res = await fetch(`/api/dashboard/chat?${params}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          conversationId: string | null;
          conversations: ChatSession[];
          messages: ChatMessage[];
        };
        const shouldExpand =
          expandOnLoad ?? (variant === "dock" || variant === "floating" ? false : true);
        applyConversationPayload(data, shouldExpand);
      } catch {
        setMessages([]);
        setExpanded(false);
      } finally {
        setLoaded(true);
      }
    },
    [applyConversationPayload, variant]
  );

  useEffect(() => {
    void loadConversation(undefined, variant !== "dock" && variant !== "floating");
    void loadCues();
  }, [loadConversation, loadCues, variant]);

  useEffect(() => {
    void loadPromptSuggestions();
  }, [loadPromptSuggestions]);

  useEffect(() => {
    if (expanded) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, sending, expanded]);

  function handleMinimize() {
    if (variant === "floating" && onRequestClose) {
      onRequestClose();
      return;
    }
    if (expanded) {
      setExpanded(false);
      return;
    }
    onRequestClose?.();
  }

  function openChat() {
    setExpanded(true);
    focusChatInput();
  }

  function focusChatInput() {
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function startNewChat() {
    setConversationId(null);
    setDraftNewChat(true);
    setMessages([]);
    setExpanded(true);
    setError("");
    setLastCreated(null);
    setRecipeBuildPlan(null);
    setCatalogDraft(null);
    setAttachments([]);
    focusChatInput();
  }

  function selectSession(id: string) {
    if (id === conversationId && !draftNewChat) {
      if (!expanded) openChat();
      return;
    }
    setError("");
    setLastCreated(null);
    setRecipeBuildPlan(null);
    void loadConversation(id, false);
  }

  async function deleteSession(id: string) {
    if (deletingId || sending) return;
    if (status !== "authenticated" || !session?.user) {
      setError("Sign in again to delete saved chats.");
      return;
    }

    setDeletingId(id);
    setError("");
    try {
      const params = new URLSearchParams({ conversationId: id });
      const res = await fetch(`/api/dashboard/chat?${params}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = (await res.json()) as {
        error?: string;
        conversations?: ChatSession[];
      };

      if (!res.ok) {
        setError(data.error ?? "Could not delete chat.");
        return;
      }

      const remaining = data.conversations ?? [];
      setSessions(remaining);

      const wasActive = conversationId === id && !draftNewChat;
      if (wasActive) {
        if (remaining.length > 0) {
          await loadConversation(remaining[0].id);
        } else {
          startNewChat();
        }
      }
    } catch {
      setError("Network error — could not delete chat.");
    } finally {
      setDeletingId(null);
    }
  }

  function addAttachments(fileList: FileList | File[]) {
    if (uploadLocked) return;
    const incoming = Array.from(fileList);
    if (!incoming.length) return;

    setAttachments((prev) => {
      const next = [...prev];
      const seen = new Set(prev.map((file) => `${file.name}-${file.size}`));
      for (const file of incoming) {
        if (next.length >= MAX_CHAT_ATTACHMENTS) break;
        const key = `${file.name}-${file.size}`;
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(file);
      }
      return next;
    });
    setExpanded(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function formatUploadBatchNote(batch: ChatUploadBatchPayload): string {
    return formatMixedUploadCallout(batch);
  }

  async function parseAttachmentBatch(
    files: File[],
    message: string
  ): Promise<ChatUploadBatchPayload> {
    setParsingBatch(true);
    try {
      return await runChatMixedBillUploadQueue(files, message, {
        onEntriesChange: setUploadEntries,
        onWorkStart: (billType) => orderWork?.startWork(billType),
        onWorkEnd: (billType) => orderWork?.endWork(billType),
      });
    } finally {
      setParsingBatch(false);
      setUploadEntries([]);
    }
  }

  async function handleChatResponse(
    data: {
      error?: string;
      reply?: string;
      conversationId?: string;
      conversations?: ChatSession[];
      cues?: CreateCue[];
      createdSuggestion?: { name: string };
      recipeBuildPlan?: RecipeBuildPlanPayload | null;
      kitchenBuildComplete?: boolean;
      catalogDraft?: ChatCatalogDraftPayload | null;
      activity?: {
        orchestrator: "head";
        consultedAgents: Array<"inventory" | "business" | "create">;
      } | null;
    }
  ) {
    if (data.conversationId) setConversationId(data.conversationId);
    if (data.conversations) setSessions(data.conversations);
    setDraftNewChat(false);
    if (data.cues?.length) setCues(data.cues);
    if (data.createdSuggestion?.name) setLastCreated(data.createdSuggestion.name);

    if (data.recipeBuildPlan !== undefined) {
      setRecipeBuildPlan(data.recipeBuildPlan);
    }
    if (data.kitchenBuildComplete) {
      setCatalogDraft(null);
      setRecipeBuildPlan(null);
    }
    if (data.catalogDraft !== undefined) {
      setCatalogDraft(data.catalogDraft);
    }
    void loadPromptSuggestions();

    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: data.reply ?? "Done.",
        activity: data.activity ?? null,
      },
    ]);
  }

  async function sendMessage(
    text: string,
    options?: { confirmSuggestion?: boolean; recipeBuildPlan?: RecipeBuildPlanPayload }
  ) {
    const trimmed = text.trim();
    const filesToSend = [...attachments];
    const confirmSuggestion = options?.confirmSuggestion ?? false;
    const outboundRecipeBuild = options?.recipeBuildPlan ?? recipeBuildPlan;
    if ((!trimmed && filesToSend.length === 0) || sending || parsingBatch) return;

    if (filesToSend.length > 0 && uploadLocked) {
      setError("Upload or processing in progress — wait for the current batch to finish.");
      return;
    }

    const menuConfirmPattern =
      /\b(yes|confirm|go ahead|create it|update it|save (it|that)|add it|link it|delete it|remove it|do it|approved?|sure)\b/i.test(
        trimmed
      );
    const threadHistory = messages.map((row) => ({ role: row.role, content: row.content }));
    const activeCatalogDraft =
      catalogDraft ??
      inferCatalogDraftFromThread(threadHistory) ??
      inferPricingSubjectDraftFromThread(threadHistory) ??
      null;
    const hasRecipeDraftInThread = threadHasRecipeDraft(threadHistory);
    const kitchenBuiltInThread = threadHasKitchenBuildInThread(threadHistory);
    const awaitingKitchenSave = threadAwaitingKitchenSaveConfirm(threadHistory);
    const awaitingPriceConfirm = threadAwaitingPriceConfirm(threadHistory);
    const awaitingReorderConfirm = threadAwaitingReorderConfirm(threadHistory);
    const catalogDishForKitchenBuild =
      activeCatalogDraft?.itemType === "dish" && activeCatalogDraft?.source !== "pricing";
    const sellPriceConfirm = detectSellPriceConfirm(trimmed, threadHistory);
    const priceAdjustConfirm = detectPriceAdjustmentConfirm(trimmed, threadHistory);
    const reorderConfirm = detectReorderThresholdConfirm(trimmed, threadHistory);
    const kitchenBuildConfirm = detectKitchenBuildConfirm(trimmed, {
      hasCatalogDish: catalogDishForKitchenBuild,
      hasRecipePlan: Boolean(outboundRecipeBuild),
      hasRecipeDraftInThread,
      hasKitchenBuildInThread: kitchenBuiltInThread,
      awaitingKitchenSave,
      awaitingPriceConfirm,
      awaitingReorderConfirm,
    });
    const anyReorderConfirm =
      (reorderConfirm ||
        (awaitingReorderConfirm && /\b(yes|confirm|go ahead|proceed)\b/i.test(trimmed))) &&
      !kitchenBuildConfirm &&
      (!awaitingPriceConfirm || awaitingReorderConfirm);
    const anyPriceConfirm =
      (sellPriceConfirm ||
        priceAdjustConfirm ||
        (awaitingPriceConfirm && /\b(yes|confirm|go ahead|proceed)\b/i.test(trimmed))) &&
      !kitchenBuildConfirm &&
      !awaitingKitchenSave &&
      !awaitingReorderConfirm;
    const confirmSuggestionFlag =
      confirmSuggestion ||
      (!anyPriceConfirm &&
        !awaitingPriceConfirm &&
        !anyReorderConfirm &&
        !awaitingReorderConfirm &&
        kitchenBuildConfirm) ||
      (detectPantryAddZeroConfirm(trimmed) && activeCatalogDraft?.itemType === "dish") ||
      (Boolean(outboundRecipeBuild) &&
        isRecipeBuildReadyToFinalize(outboundRecipeBuild) &&
        menuConfirmPattern);
    const confirmUpload = detectUploadConfirm(trimmed);
    const confirmInventory =
      confirmUpload ||
      detectPantryAddZeroConfirm(trimmed) ||
      (!anyPriceConfirm && !anyReorderConfirm && kitchenBuildConfirm) ||
      anyPriceConfirm ||
      anyReorderConfirm;
    const confirmBusiness = confirmUpload;

    setExpanded(true);
    setSending(true);
    setError("");

    let uploadNote = "";
    let uploadBatch: ChatUploadBatchPayload | undefined;
    let catalogNote = "";
    let outboundCatalogDraft: ChatCatalogDraftPayload | undefined = activeCatalogDraft ?? undefined;
    try {
      if (filesToSend.length > 0 && shouldParseAttachmentsAsBills(trimmed, filesToSend)) {
        uploadBatch = await parseAttachmentBatch(filesToSend, trimmed);
        if (uploadBatch.ready === 0) {
          throw new Error(
            uploadBatch.failed > 0
              ? "Could not parse any attached files."
              : "No files were parsed."
          );
        }
        uploadNote = formatUploadBatchNote(uploadBatch);
        setAttachments([]);
      } else if (filesToSend.length > 0) {
        const catalogResult = await buildCatalogDraftFromChat(trimmed, filesToSend, "head");
        if (!catalogResult.draft) {
          throw new Error("Could not identify a menu or pantry item from that photo.");
        }
        outboundCatalogDraft = catalogResult.draft;
        setCatalogDraft(catalogResult.draft);
        catalogNote = catalogResult.note;
        setAttachments([]);
      } else {
        const catalogResult = await buildCatalogDraftFromChat(trimmed, [], "head");
        if (catalogResult.draft) {
          outboundCatalogDraft = catalogResult.draft;
          setCatalogDraft(catalogResult.draft);
          catalogNote = catalogResult.note;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload files.");
      setSending(false);
      focusChatInput();
      return;
    }

    const outbound = [trimmed, uploadNote, catalogNote].filter(Boolean).join("\n\n");
    const correctedCatalogDraft = applyCatalogDraftCorrection(
      outboundCatalogDraft ?? activeCatalogDraft ?? undefined,
      trimmed,
      threadHistory
    );
    if (correctedCatalogDraft) {
      setCatalogDraft(correctedCatalogDraft);
    }

    setMessages((prev) => [...prev, { role: "user", content: outbound }]);
    setInput("");

    try {
      const res = await fetch("/api/dashboard/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: outbound,
          userMessage: trimmed,
          conversationId: draftNewChat ? undefined : conversationId,
          newChat: draftNewChat,
          context: "head",
          financeView,
          confirmSuggestion: confirmSuggestionFlag,
          confirmInventory,
          confirmBusiness,
          uploadBatch,
          catalogDraft: correctedCatalogDraft ?? outboundCatalogDraft,
          recipeBuild: outboundRecipeBuild ?? undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        reply?: string;
        conversationId?: string;
        conversations?: ChatSession[];
        cues?: CreateCue[];
        createdSuggestion?: { name: string };
        recipeBuildPlan?: RecipeBuildPlanPayload | null;
        kitchenBuildComplete?: boolean;
        catalogDraft?: ChatCatalogDraftPayload | null;
        activity?: {
          orchestrator: "head";
          consultedAgents: Array<"inventory" | "business" | "create">;
        } | null;
      };

      if (!res.ok) {
        setError(data.error ?? "Could not reach the chef agent.");
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      await handleChatResponse(data);
    } catch {
      setError("Network error — try again.");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setSending(false);
      focusChatInput();
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void sendMessage(input);
  }

  function openFilePicker() {
    setExpanded(true);
    fileInputRef.current?.click();
  }

  const activeSessionId = draftNewChat ? null : conversationId;
  const showSessionTabs = sessions.length + (draftNewChat ? 1 : 0) >= 2;
  const showGreeting = expanded && !hasUserMessages(messages);
  const showSampleQueries = showGreeting;
  const effectiveTryAsking = tryAskingPrompts.length
    ? tryAskingPrompts
    : profile.sampleQueries;

  function queuePrompt(prompt: string) {
    setInput(prompt);
    setExpanded(true);
    queueMicrotask(() => focusChatInput());
  }

  const showCreativeCues = showCues;
  const isFloating = variant === "floating";
  const isDock = variant === "dock" || isFloating;
  const showAttachments = showAttachmentsProp;

  const canSend = Boolean(input.trim()) || attachments.length > 0;

  const attachmentChips =
    showAttachments && attachments.length > 0 ? (
      <div className="flex flex-wrap gap-1.5">
        {attachments.map((file, index) => (
          <span
            key={`${file.name}-${file.size}-${index}`}
            className="inline-flex max-w-[12rem] items-center gap-1 rounded-full border border-chef-border bg-chef-muted/70 px-2.5 py-1 text-xs text-chef-text"
          >
            <span className="truncate">{file.name}</span>
            <button
              type="button"
              onClick={() => removeAttachment(index)}
              disabled={sending || uploadLocked}
              className="sc-icon-btn h-5 w-5 shrink-0 p-0"
              aria-label={`Remove ${file.name}`}
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}
      </div>
    ) : null;

  const uploadProgressBanner =
    showAttachments && (parsingBatch || uploadEntries.length > 0) ? (
      <div
        className="flex items-center gap-2 rounded-lg border border-chef-sage/40 bg-chef-sage/10 px-3 py-2 text-sm text-chef-text-muted"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-chef-sage" aria-hidden />
        {batchProgressLabel(uploadEntries) || "Processing uploads…"}
      </div>
    ) : null;

  const uploadLockBanner =
    showAttachments &&
    orderWork?.anyBusy &&
    !parsingBatch &&
    uploadEntries.length === 0 ? (
      <div
        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-chef-text-muted"
        role="status"
      >
        Upload or processing in progress on Upload orders — wait before attaching more files.
      </div>
    ) : null;

  const inputAttachPad = showAttachments ? "pr-11" : "";

  const attachClipControl = showAttachments ? (
    <Tooltip
      content={
        attachments.length >= MAX_CHAT_ATTACHMENTS
          ? `Maximum ${MAX_CHAT_ATTACHMENTS} files`
          : `Attach up to ${MAX_CHAT_ATTACHMENTS} files (PDF or image)`
      }
    >
      <button
        type="button"
        disabled={
          sending ||
          uploadLocked ||
          attachments.length >= MAX_CHAT_ATTACHMENTS
        }
        onClick={(event) => {
          event.stopPropagation();
          openFilePicker();
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 sc-icon-btn h-8 w-8 p-0 text-chef-text-muted hover:text-chef-text disabled:opacity-40"
        aria-label="Attach files"
      >
        <Paperclip className="h-4 w-4" aria-hidden />
      </button>
    </Tooltip>
  ) : null;

  const cardClass = isDock
    ? "rounded-2xl border border-chef-border/80 bg-white/95 shadow-[0_8px_32px_rgba(42,38,34,0.12)] backdrop-blur-md"
    : "sc-card";

  if (!loaded) {
    return (
      <div className={`${cardClass} flex flex-col gap-2 p-3 sm:p-4`}>
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: MAX_CHAT_SESSIONS }).map((_, index) => (
            <div key={index} className="h-8 animate-pulse rounded-md bg-chef-muted" />
          ))}
        </div>
        <div className="flex gap-2">
          <div className={`flex-1 animate-pulse rounded-xl bg-chef-muted ${isDock ? "h-12" : "h-10"}`} />
          <div className={`animate-pulse rounded-xl bg-chef-muted ${isDock ? "h-12 w-24" : "h-10 w-[4.5rem]"}`} />
        </div>
      </div>
    );
  }

  return (
    <div className={isDock ? "flex flex-col" : "space-y-4"}>
      {showAttachments && (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={CHAT_ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) addAttachments(event.target.files);
          }}
        />
      )}
      {showCreativeCues && cues.length > 0 && expanded && (
        <div className="mb-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {cues.map((cue) => (
            <CreativeCueCard
              key={cue.id}
              cue={cue}
              compact
              onSelect={(selected) => setInput(cueToChatPrompt(selected))}
            />
          ))}
        </div>
      )}

      <div className={`${cardClass} flex flex-col overflow-hidden`}>
        {!expanded ? (
          <div className={`flex flex-col ${isDock ? "gap-2.5 p-3 sm:gap-3 sm:p-4" : "gap-2 p-3"}`}>
            {isDock && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-chef-text-muted">
                  Saved chats ({sessions.length}/{MAX_CHAT_SESSIONS})
                </p>
                <div className="flex gap-1.5">
                  <Tooltip content={`Start a new chat (up to ${MAX_CHAT_SESSIONS} saved)`}>
                    <button
                      type="button"
                      onClick={startNewChat}
                      className="sc-btn-secondary px-3 py-1.5 text-sm"
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
                      New chat
                    </button>
                  </Tooltip>
                  <MinimizeChatButton onClick={handleMinimize} disabled={sending} />
                </div>
              </div>
            )}
            {isDock && showSessionTabs && (
              <SessionTabsRow
                sessions={sessions}
                activeSessionId={activeSessionId}
                draftNewChat={draftNewChat}
                deletingId={deletingId}
                equalWidth
                onSelect={selectSession}
                onDelete={(id) => void deleteSession(id)}
              />
            )}
            {attachmentChips}
            {uploadProgressBanner}
            {uploadLockBanner}
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <input
                  type="text"
                  readOnly
                  value=""
                  placeholder={CHAT_PLACEHOLDER.head}
                  onClick={openChat}
                  onFocus={openChat}
                  aria-label={`Open ${profile.name}`}
                  className={`w-full cursor-text rounded-xl border border-chef-border bg-white px-4 text-chef-text placeholder:text-chef-text-muted/70 ${inputAttachPad} ${
                    isDock ? "py-4 text-lg" : "py-2.5 text-base"
                  }`}
                />
                {attachClipControl}
              </div>
              <button
                type="button"
                onClick={openChat}
                className={`sc-btn-primary shrink-0 ${isDock ? "px-6 py-4 text-base" : "px-4 py-2.5 text-base"}`}
              >
                <Send className="h-4 w-4" aria-hidden />
                <span className="sr-only sm:not-sr-only">Send</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-chef-border bg-chef-muted/40 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-medium text-chef-text">
                    {!hideHeaderIdentity && (
                      <>
                        <AgentBrandMark agent={chatContextAgent()} size={32} />
                        {profile.name}
                        <span className="font-normal text-chef-text-muted">·</span>
                      </>
                    )}
                    <span className="font-normal text-chef-text-muted">{profile.tagline}</span>
                    <span className="mx-1.5 font-normal text-chef-text-muted">·</span>
                    <span className="font-normal text-chef-text-muted">
                      Up to {MAX_CHAT_SESSIONS} saved chats
                    </span>
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Tooltip content={`Start a new chat (up to ${MAX_CHAT_SESSIONS} saved)`}>
                    <button
                      type="button"
                      onClick={startNewChat}
                      className="sc-btn-secondary px-3 py-1.5 text-sm"
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
                      New chat
                    </button>
                  </Tooltip>
                  <MinimizeChatButton onClick={handleMinimize} disabled={sending} />
                </div>
              </div>
              {showSessionTabs && (
                <div className="mt-2">
                  <SessionTabsRow
                    sessions={sessions}
                    activeSessionId={activeSessionId}
                    draftNewChat={draftNewChat}
                    deletingId={deletingId}
                    equalWidth={isDock}
                    onSelect={selectSession}
                    onDelete={(id) => void deleteSession(id)}
                  />
                </div>
              )}
            </div>

            <div
              ref={scrollRef}
              className={`space-y-3 overflow-y-auto p-4 sm:p-5 ${
                isDock ? "max-h-[min(32rem,58vh)]" : "max-h-[20rem]"
              }`}
            >
              {showGreeting && (
                <div className="flex justify-start">
                  <div className="max-w-[90%] rounded-2xl bg-chef-muted px-4 py-2.5 text-sm leading-relaxed text-chef-text whitespace-pre-line">
                    {renderChatMarkdown(greeting)}
                  </div>
                </div>
              )}

              {messages.map((msg, index) => {
                return (
                  <div
                    key={index}
                    className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
                          msg.role === "user"
                            ? "bg-chef-sage text-white"
                            : "bg-chef-muted text-chef-text"
                        }`}
                      >
                        {renderChatMarkdown(msg.content)}
                      </div>
                    </div>
                    {msg.role === "assistant" && msg.activity?.consultedAgents?.length ? (
                      <p className="mt-1 px-1 text-xs text-chef-text-muted">
                        Consulted with{" "}
                        {msg.activity.consultedAgents
                          .map((agent) => CHAT_ASSISTANT_PROFILES[agent].name)
                          .join(", ")}
                        .
                      </p>
                    ) : null}
                  </div>
                );
              })}

              {recipeBuildPlan && (
                <RecipeBuildPicker
                  plan={recipeBuildPlan}
                  disabled={sending}
                  onFinalize={(plan) =>
                    void sendMessage("Go ahead — add the dish, ingredients, and recipe", {
                      confirmSuggestion: true,
                      recipeBuildPlan: plan,
                    })
                  }
                />
              )}

              {showSampleQueries && (
                <div className="space-y-2 pt-1">
                  <p className="text-xs font-medium text-chef-text-muted">Sample Queries</p>
                  <div className="flex flex-wrap gap-2">
                    {effectiveTryAsking.map((query) => (
                      <button
                        key={query}
                        type="button"
                        onClick={() => queuePrompt(query)}
                        disabled={sending}
                        className="rounded-full border border-chef-border bg-white px-3 py-1.5 text-left text-xs text-chef-text hover:border-chef-sage hover:bg-chef-sage-light/30 disabled:opacity-50"
                      >
                        {query}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {sending && (
                <div className="space-y-1">
                  <p className="flex items-center gap-2 text-sm text-chef-text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Sous Chef is thinking…
                  </p>
                  <p className="text-xs text-chef-text-muted">
                    Sous Chef may consult specialists before replying.
                  </p>
                </div>
              )}
            </div>

            {error && <p className="px-4 pb-2 text-sm text-red-600">{error}</p>}
            {lastCreated && (
              <p className="border-t border-chef-border bg-chef-sage-light/30 px-4 py-2 text-sm text-chef-text">
                Added <span className="font-semibold">{lastCreated}</span> to Suggested.{" "}
                <Link href="/recipes" className="font-medium text-chef-sage underline">
                  View in Recipes
                </Link>
              </p>
            )}

            <form
              onSubmit={handleSubmit}
              className={`flex flex-col gap-2 border-t border-chef-border bg-white/80 ${
                isDock ? "p-3 sm:p-4" : "p-3"
              }`}
            >
              {attachmentChips}
              {uploadProgressBanner}
              {uploadLockBanner}
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder={CHAT_PLACEHOLDER.head}
                    disabled={sending}
                    className={`w-full rounded-xl border border-chef-border px-3 text-chef-text placeholder:text-chef-text-muted/70 ${inputAttachPad} ${
                      isDock ? "py-3.5 text-base" : "py-2.5 text-sm"
                    }`}
                  />
                  {attachClipControl}
                </div>
                <button
                  type="submit"
                  disabled={sending || !canSend}
                  className={`sc-btn-primary shrink-0 ${isDock ? "px-6 py-4 text-base" : "px-4 py-2.5 text-base"}`}
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Send className="h-4 w-4" aria-hidden />
                  )}
                  <span className="sr-only sm:not-sr-only">Send</span>
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
