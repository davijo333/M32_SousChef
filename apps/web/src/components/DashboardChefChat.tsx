"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquarePlus, Minimize2, Paperclip, Send, X } from "lucide-react";
import { CreativeCueCard } from "@/components/CreativeCueCard";
import type { CreateCue } from "@/lib/create-cues";
import { cueToChatPrompt } from "@/lib/create-cues";
import {
  CHAT_ATTACHMENT_ACCEPT,
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_SESSIONS,
} from "@/lib/chat-retention";
import { CREATIVE_CUE_SELECT_EVENT } from "@/lib/creative-cue-events";
import {
  buildAssistantGreeting,
  CHAT_ASSISTANT_PROFILES,
  CHAT_PLACEHOLDER,
  type DashboardChatContext,
} from "@/lib/dashboard-chat";
import {
  connectAgentButtonLabel,
  detectSuggestedAgentHandoff,
  handoffToDashboardSection,
  type SpecialistHandoffTarget,
} from "@/lib/chat-handoff";
import { renderChatMarkdown } from "@/lib/chat-markdown";
import { AgentBrandMark } from "@/components/BrandMark";
import type { AgentBrandAgent } from "@/lib/agent-icons";
import { Tooltip } from "@/components/ui/Tooltip";
import type { DashboardFinancePeriod } from "@/lib/dashboard-stats";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatSession = {
  id: string;
  title: string;
  updatedAt: string;
};

type DashboardChefChatProps = {
  context: DashboardChatContext;
  financeView?: DashboardFinancePeriod;
  showCues?: boolean;
  /** Section title already shows avatar + name — omit duplicate in chat chrome. */
  hideHeaderIdentity?: boolean;
  /** `dock` = fixed bottom-center bar with glass card styling. */
  variant?: "inline" | "dock";
  dashboardSection?: "inventory" | "business" | "create";
  agentContext?: DashboardChatContext;
  onAgentContextChange?: (context: DashboardChatContext) => void;
  onAgentHandoff?: (section: "inventory" | "business" | "create") => void;
};

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
  if (sessions.length === 0 && !draftNewChat) return null;

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
          className={`rounded-md bg-chef-sage px-3 py-2 text-center text-sm font-medium text-white ${
            equalWidth ? "min-w-0 flex-1" : ""
          }`}
        >
          New chat
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

function chatContextAgent(context: DashboardChatContext): AgentBrandAgent {
  if (context === "head") return "head_chef";
  if (context === "create") return "create";
  return context;
}

export function DashboardChefChat({
  context,
  financeView = "week",
  showCues = false,
  hideHeaderIdentity = false,
  variant = "inline",
  agentContext: controlledAgentContext,
  onAgentContextChange,
  onAgentHandoff,
}: DashboardChefChatProps) {
  const { data: session } = useSession();
  const chefName = session?.user?.name ?? "Chef";
  const [localAgentContext, setLocalAgentContext] = useState<DashboardChatContext>(context);
  const agentContext = controlledAgentContext ?? localAgentContext;

  function setAgentContext(next: DashboardChatContext) {
    if (onAgentContextChange) {
      onAgentContextChange(next);
    } else {
      setLocalAgentContext(next);
    }
  }

  const profile = CHAT_ASSISTANT_PROFILES[agentContext];

  const [cues, setCues] = useState<CreateCue[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draftNewChat, setDraftNewChat] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");
  const [lastCreated, setLastCreated] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<File[]>([]);

  const greeting = buildAssistantGreeting(agentContext, chefName);

  useEffect(() => {
    if (!onAgentContextChange) {
      setLocalAgentContext(context);
    }
  }, [context, onAgentContextChange]);

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

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt: string }>).detail;
      if (!detail?.prompt) return;
      setInput(detail.prompt);
      setExpanded(true);
      queueMicrotask(() => inputRef.current?.focus());
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
        const params = new URLSearchParams({ context });
        if (selectedId) params.set("conversationId", selectedId);
        const res = await fetch(`/api/dashboard/chat?${params}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          conversationId: string | null;
          conversations: ChatSession[];
          messages: ChatMessage[];
        };
        const shouldExpand =
          expandOnLoad ?? (variant === "dock" ? false : true);
        applyConversationPayload(data, shouldExpand);
      } catch {
        setMessages([]);
        setExpanded(false);
      } finally {
        setLoaded(true);
      }
    },
    [applyConversationPayload, context, variant]
  );

  useEffect(() => {
    setSessions([]);
    setConversationId(null);
    setDraftNewChat(false);
    setMessages([]);
    setExpanded(false);
    setLoaded(false);
    void loadConversation();
    void loadCues();
  }, [context, loadConversation, loadCues]);

  useEffect(() => {
    if (expanded) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, sending, expanded]);

  function openChat() {
    setExpanded(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function startNewChat() {
    setConversationId(null);
    setDraftNewChat(true);
    setMessages([]);
    setExpanded(true);
    setError("");
    setLastCreated(null);
    setAttachments([]);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function selectSession(id: string) {
    if (id === conversationId && !draftNewChat) {
      if (!expanded) openChat();
      return;
    }
    setError("");
    setLastCreated(null);
    void loadConversation(id, false);
  }

  async function deleteSession(id: string) {
    if (deletingId || sending) return;

    setDeletingId(id);
    setError("");
    try {
      const params = new URLSearchParams({ context, conversationId: id });
      const res = await fetch(`/api/dashboard/chat?${params}`, { method: "DELETE" });
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

  async function uploadAttachments(files: File[]): Promise<string[]> {
    const uploaded: string[] = [];
    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      form.append("billType", "supplier");
      const res = await fetch("/api/bills/parse", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `Could not upload ${file.name}`);
      }
      uploaded.push(file.name);
    }
    return uploaded;
  }

  function applyHandoff(target: SpecialistHandoffTarget) {
    setAgentContext(target);
    onAgentHandoff?.(handoffToDashboardSection(target));
    if (target === "create") void loadCues();
  }

  async function handleChatResponse(
    data: {
      error?: string;
      reply?: string;
      conversationId?: string;
      conversations?: ChatSession[];
      cues?: CreateCue[];
      createdSuggestion?: { name: string };
      handoff?: SpecialistHandoffTarget;
      agentContext?: DashboardChatContext;
    }
  ) {
    if (data.conversationId) setConversationId(data.conversationId);
    if (data.conversations) setSessions(data.conversations);
    setDraftNewChat(false);
    if (data.cues?.length) setCues(data.cues);
    if (data.createdSuggestion?.name) setLastCreated(data.createdSuggestion.name);

    if (data.handoff) {
      applyHandoff(data.handoff);
    } else if (data.agentContext && data.agentContext !== context) {
      setAgentContext(data.agentContext);
    }

    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: data.reply ?? "Done." },
    ]);
  }

  async function connectToAgent(target: SpecialistHandoffTarget) {
    if (sending) return;

    setExpanded(true);
    setSending(true);
    setError("");

    const connectLabel = connectAgentButtonLabel(target);
    setMessages((prev) => [...prev, { role: "user", content: connectLabel }]);

    try {
      const res = await fetch("/api/dashboard/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectAgent: target,
          message: connectLabel,
          conversationId: draftNewChat ? undefined : conversationId,
          newChat: draftNewChat,
          context,
          financeView,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        reply?: string;
        conversationId?: string;
        conversations?: ChatSession[];
        cues?: CreateCue[];
        createdSuggestion?: { name: string };
        handoff?: SpecialistHandoffTarget;
        agentContext?: DashboardChatContext;
      };

      if (!res.ok) {
        setError(data.error ?? "Could not connect to that agent.");
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      await handleChatResponse(data);
    } catch {
      setError("Network error — try again.");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
  }

  async function sendMessage(text: string, confirmSuggestion = false) {
    const trimmed = text.trim();
    const filesToSend = [...attachments];
    if ((!trimmed && filesToSend.length === 0) || sending) return;

    setExpanded(true);
    setSending(true);
    setError("");

    let uploadNote = "";
    try {
      if (filesToSend.length > 0) {
        const names = await uploadAttachments(filesToSend);
        uploadNote = `Attached ${names.length} file${names.length === 1 ? "" : "s"}: ${names.join(", ")}`;
        setAttachments([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload files.");
      setSending(false);
      return;
    }

    const outbound = [trimmed, uploadNote].filter(Boolean).join("\n\n");
    setMessages((prev) => [...prev, { role: "user", content: outbound }]);
    setInput("");

    try {
      const res = await fetch("/api/dashboard/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: outbound,
          conversationId: draftNewChat ? undefined : conversationId,
          newChat: draftNewChat,
          context,
          agentContext: agentContext !== context ? agentContext : undefined,
          financeView,
          confirmSuggestion,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        reply?: string;
        conversationId?: string;
        conversations?: ChatSession[];
        cues?: CreateCue[];
        createdSuggestion?: { name: string };
        handoff?: "inventory" | "business" | "create";
        agentContext?: DashboardChatContext;
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
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const confirm =
      agentContext === "create" &&
      /\b(add it|save (it|that|this)|put it in suggestions?)\b/i.test(input);
    void sendMessage(input, confirm);
  }

  function openFilePicker() {
    setExpanded(true);
    fileInputRef.current?.click();
  }

  const activeSessionId = draftNewChat ? null : conversationId;
  const showGreeting = expanded && !hasUserMessages(messages);
  const showSampleQueries = showGreeting;
  const showCreativeCues = showCues;
  const isDock = variant === "dock";
  const delegatedToSpecialist = agentContext !== context;
  const showAttachments = context === "head";

  const canSend = Boolean(input.trim()) || attachments.length > 0;

  function returnToSousChef() {
    setAgentContext(context);
    setLastCreated(null);
  }

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
              disabled={sending}
              className="sc-icon-btn h-5 w-5 shrink-0 p-0"
              aria-label={`Remove ${file.name}`}
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}
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
        disabled={sending || attachments.length >= MAX_CHAT_ATTACHMENTS}
        onClick={(event) => {
          event.stopPropagation();
          openFilePicker();
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 sc-icon-btn h-8 w-8 p-0 text-chef-text-muted hover:text-chef-text"
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
              </div>
            )}
            {isDock && (
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
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <input
                  type="text"
                  readOnly
                  value=""
                  placeholder={CHAT_PLACEHOLDER[agentContext]}
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
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-medium text-chef-text">
                  {!hideHeaderIdentity && (
                    <>
                      <AgentBrandMark agent={chatContextAgent(context)} size={32} />
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
                <div className="flex gap-1.5">
                  {delegatedToSpecialist && (
                    <Tooltip content="Return to Sous Chef routing">
                      <button
                        type="button"
                        onClick={returnToSousChef}
                        className="sc-btn-secondary px-3 py-1.5 text-sm"
                      >
                        Connect back to Sous Chef
                      </button>
                    </Tooltip>
                  )}
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
                  <Tooltip content="Collapse chat">
                    <button
                      type="button"
                      onClick={() => setExpanded(false)}
                      className="sc-btn-secondary px-2.5 py-1 text-xs"
                    >
                      <Minimize2 className="h-3.5 w-3.5" aria-hidden />
                      Minimize
                    </button>
                  </Tooltip>
                </div>
              </div>
              {(sessions.length > 0 || draftNewChat) && (
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
                const suggestedAgent =
                  msg.role === "assistant" ? detectSuggestedAgentHandoff(msg.content) : null;
                const showConnectButton =
                  suggestedAgent !== null && suggestedAgent !== agentContext;

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
                    {showConnectButton && (
                      <button
                        type="button"
                        onClick={() => void connectToAgent(suggestedAgent)}
                        disabled={sending}
                        className="mt-2 rounded-full border border-chef-sage bg-white px-3 py-1.5 text-xs font-medium text-chef-sage hover:bg-chef-sage-light/30 disabled:opacity-50"
                      >
                        {connectAgentButtonLabel(suggestedAgent)}
                      </button>
                    )}
                  </div>
                );
              })}

              {showSampleQueries && (
                <div className="space-y-2 pt-1">
                  <p className="text-xs font-medium text-chef-text-muted">Sample questions</p>
                  <div className="flex flex-wrap gap-2">
                    {profile.sampleQueries.map((query) => (
                      <button
                        key={query}
                        type="button"
                        onClick={() => void sendMessage(query)}
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
                <p className="flex items-center gap-2 text-sm text-chef-text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {profile.name} is thinking…
                </p>
              )}
            </div>

            {error && <p className="px-4 pb-2 text-sm text-red-600">{error}</p>}
            {lastCreated && agentContext === "create" && (
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
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder={CHAT_PLACEHOLDER[agentContext]}
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
