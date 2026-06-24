"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CreateCue } from "@/lib/create-cues";
import { MAX_CHAT_SESSIONS } from "@/lib/chat-retention";
import {
  buildAssistantGreeting,
  CHAT_ASSISTANT_PROFILES,
  CHAT_PLACEHOLDER,
  type DashboardChatContext,
} from "@/lib/dashboard-chat";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatSession = {
  id: string;
  title: string;
  updatedAt: string;
};

const CUE_STYLES: Record<CreateCue["kind"], string> = {
  day: "border-chef-sage/30 bg-chef-sage-light/40",
  weather: "border-sky-200 bg-sky-50",
  holiday: "border-chef-amber/40 bg-chef-amber-light/50",
  season: "border-emerald-200 bg-emerald-50",
};

type DashboardChefChatProps = {
  context: DashboardChatContext;
  financeView?: "week" | "month";
  showCues?: boolean;
};

function sessionTabClass(active: boolean): string {
  return `max-w-[10rem] truncate rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
    active
      ? "bg-chef-sage text-white"
      : "bg-chef-muted text-chef-text-muted hover:text-chef-text"
  }`;
}

function hasUserMessages(messages: ChatMessage[]): boolean {
  return messages.some((message) => message.role === "user");
}

export function DashboardChefChat({
  context,
  financeView = "week",
  showCues = false,
}: DashboardChefChatProps) {
  const { data: session } = useSession();
  const chefName = session?.user?.name ?? "Chef";
  const profile = CHAT_ASSISTANT_PROFILES[context];

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const greeting = buildAssistantGreeting(context, chefName);

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

  const applyConversationPayload = useCallback(
    (data: {
      conversationId: string | null;
      conversations?: ChatSession[];
      messages: ChatMessage[];
    }) => {
      if (data.conversations) setSessions(data.conversations);
      setConversationId(data.conversationId);
      setDraftNewChat(false);
      if (data.messages.length > 0) {
        setMessages(data.messages);
        setExpanded(true);
      } else {
        setMessages([]);
        setExpanded(false);
      }
    },
    []
  );

  const loadConversation = useCallback(
    async (selectedId?: string | null) => {
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
        applyConversationPayload(data);
      } catch {
        setMessages([]);
        setExpanded(false);
      } finally {
        setLoaded(true);
      }
    },
    [applyConversationPayload, context]
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
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function selectSession(id: string) {
    if (id === conversationId && !draftNewChat) return;
    setError("");
    setLastCreated(null);
    void loadConversation(id);
  }

  async function sendMessage(text: string, confirmSuggestion = false) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setExpanded(true);
    setSending(true);
    setError("");
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");

    try {
      const res = await fetch("/api/dashboard/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          conversationId: draftNewChat ? undefined : conversationId,
          newChat: draftNewChat,
          context,
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
      };

      if (!res.ok) {
        setError(data.error ?? "Could not reach the chef agent.");
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      if (data.conversationId) setConversationId(data.conversationId);
      if (data.conversations) setSessions(data.conversations);
      setDraftNewChat(false);
      if (data.cues?.length) setCues(data.cues);
      if (data.createdSuggestion?.name) setLastCreated(data.createdSuggestion.name);

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply ?? "Done." },
      ]);
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
      context === "create" &&
      /\b(add it|save (it|that|this)|put it in suggestions?)\b/i.test(input);
    void sendMessage(input, confirm);
  }

  const activeSessionId = draftNewChat ? null : conversationId;
  const showGreeting = expanded && !hasUserMessages(messages);
  const showSampleQueries = showGreeting;

  if (!loaded) {
    return (
      <div className="sc-card p-4 text-sm text-chef-text-muted">Loading chat…</div>
    );
  }

  return (
    <div className="space-y-4">
      {showCues && cues.length > 0 && expanded && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cues.map((cue) => (
            <button
              key={cue.id}
              type="button"
              onClick={() =>
                setInput(`Ideas for ${cue.label.toLowerCase()}: ${cue.detail}`)
              }
              className={`rounded-xl border p-4 text-left transition hover:shadow-sm ${CUE_STYLES[cue.kind]}`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-chef-text-muted">
                {cue.kind}
              </p>
              <p className="mt-1 text-sm font-semibold text-chef-text">{cue.label}</p>
              <p className="mt-1 text-xs text-chef-text-muted">{cue.detail}</p>
            </button>
          ))}
        </div>
      )}

      <div className="sc-card flex flex-col overflow-hidden">
        {!expanded ? (
          <button
            type="button"
            onClick={openChat}
            className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-chef-muted/30"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-chef-text">{profile.name}</p>
              <p className="mt-0.5 text-xs text-chef-text-muted">{profile.tagline}</p>
              <p className="mt-2 text-sm text-chef-text-muted">
                Click to chat — I&apos;ll greet you with sample questions you can ask.
              </p>
            </div>
            <span className="shrink-0 text-chef-text-muted" aria-hidden>
              →
            </span>
          </button>
        ) : (
          <>
            <div className="border-b border-chef-border bg-chef-muted/40 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-chef-text">
                  {profile.name}
                  <span className="mx-1.5 font-normal text-chef-text-muted">·</span>
                  <span className="font-normal text-chef-text-muted">{profile.tagline}</span>
                  <span className="mx-1.5 font-normal text-chef-text-muted">·</span>
                  <span className="font-normal text-chef-text-muted">
                    Up to {MAX_CHAT_SESSIONS} saved chats
                  </span>
                </p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setExpanded(false)}
                    className="rounded-md border border-chef-border bg-white px-2.5 py-1 text-xs font-medium text-chef-text-muted hover:text-chef-text"
                  >
                    Minimize
                  </button>
                  <button
                    type="button"
                    onClick={startNewChat}
                    className="rounded-md border border-chef-border bg-white px-2.5 py-1 text-xs font-medium text-chef-text hover:bg-chef-muted"
                  >
                    + New chat
                  </button>
                </div>
              </div>
              {(sessions.length > 0 || draftNewChat) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {sessions.map((sessionRow) => (
                    <button
                      key={sessionRow.id}
                      type="button"
                      onClick={() => selectSession(sessionRow.id)}
                      className={sessionTabClass(activeSessionId === sessionRow.id)}
                      title={sessionRow.title}
                    >
                      {sessionRow.title}
                    </button>
                  ))}
                  {draftNewChat && (
                    <span className={sessionTabClass(true)}>New chat</span>
                  )}
                </div>
              )}
            </div>

            <div ref={scrollRef} className="max-h-[20rem] space-y-3 overflow-y-auto p-4">
              {showGreeting && (
                <div className="flex justify-start">
                  <div className="max-w-[90%] rounded-2xl bg-chef-muted px-4 py-2.5 text-sm leading-relaxed text-chef-text whitespace-pre-line">
                    {greeting}
                  </div>
                </div>
              )}

              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-chef-sage text-white"
                        : "bg-chef-muted text-chef-text"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

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
                <p className="text-sm text-chef-text-muted">{profile.name} is thinking…</p>
              )}
            </div>

            {error && <p className="px-4 pb-2 text-sm text-red-600">{error}</p>}
            {lastCreated && context === "create" && (
              <p className="border-t border-chef-border bg-chef-sage-light/30 px-4 py-2 text-sm text-chef-text">
                Added <span className="font-semibold">{lastCreated}</span> to Suggested.{" "}
                <Link href="/recipes" className="font-medium text-chef-sage underline">
                  View in Recipes
                </Link>
              </p>
            )}

            <form
              onSubmit={handleSubmit}
              className="flex gap-2 border-t border-chef-border bg-white/80 p-3"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={CHAT_PLACEHOLDER[context]}
                disabled={sending}
                className="min-w-0 flex-1 rounded-xl border border-chef-border px-3 py-2.5 text-sm text-chef-text placeholder:text-chef-text-muted/70"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="shrink-0 rounded-xl bg-chef-sage px-4 py-2.5 text-sm font-semibold text-white hover:bg-chef-sage-dark disabled:opacity-50"
              >
                Send
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
