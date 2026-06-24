"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

type ChatSession = {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
};

const ACTIVE_CHAT_KEY = "souschef-active-chat";

export function DashboardChat() {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [maxSessions, setMaxSessions] = useState(5);
  const [loading, setLoading] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadSessions(selectId?: string | null) {
    const res = await fetch("/api/chat");
    if (!res.ok) return;
    const data = await res.json();
    setSessions(data.conversations ?? []);
    setMaxSessions(data.maxSessions ?? 5);

    const preferred =
      selectId ?? conversationId ?? sessionStorage.getItem(ACTIVE_CHAT_KEY);
    if (preferred) {
      await loadConversation(preferred);
    }
  }

  async function loadConversation(id: string) {
    const res = await fetch(`/api/chat/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setConversationId(data.id);
    sessionStorage.setItem(ACTIVE_CHAT_KEY, data.id);
    setMessages(
      (data.messages ?? []).filter((m: Message) => m.role === "user" || m.role === "assistant")
    );
    setExpanded(true);
    setSessionsOpen(false);
  }

  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (expanded) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, expanded]);

  function startNewChat() {
    setConversationId(null);
    setMessages([]);
    sessionStorage.removeItem(ACTIVE_CHAT_KEY);
    setSessionsOpen(false);
    setExpanded(true);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setExpanded(true);
    setMessages((m) => [...m, { role: "user", content: userMessage }]);
    setLoading(true);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userMessage, conversationId }),
    });

    setLoading(false);

    if (res.status === 401) {
      router.push("/login");
      return;
    }

    const data = await res.json();
    if (data.conversationId) {
      setConversationId(data.conversationId);
      sessionStorage.setItem(ACTIVE_CHAT_KEY, data.conversationId);
    }
    setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    await loadSessions(data.conversationId);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 px-4 pb-4">
      <div
        className={`mx-auto flex w-full max-w-3xl flex-col rounded-2xl border border-chef-border bg-chef-surface shadow-xl transition-all ${
          expanded ? "max-h-[min(70vh,560px)]" : ""
        }`}
      >
        {expanded && (
          <div className="flex items-center justify-between border-b border-chef-border px-4 py-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-chef-text">Sous Chef</p>
              <button
                type="button"
                onClick={() => setSessionsOpen((v) => !v)}
                className="rounded-lg border border-chef-border px-2 py-0.5 text-xs text-chef-text-muted hover:bg-chef-muted"
              >
                Chats ({sessions.length}/{maxSessions})
              </button>
              <button
                type="button"
                onClick={startNewChat}
                className="rounded-lg border border-chef-border px-2 py-0.5 text-xs text-chef-sage hover:bg-chef-sage-light"
              >
                New chat
              </button>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-xs text-chef-text-muted hover:text-chef-text"
            >
              Minimize
            </button>
          </div>
        )}

        {expanded && sessionsOpen && (
          <div className="max-h-40 overflow-y-auto border-b border-chef-border bg-chef-muted/40 px-3 py-2">
            {sessions.length === 0 ? (
              <p className="text-xs text-chef-text-muted">No saved chats yet.</p>
            ) : (
              <ul className="space-y-1">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => loadConversation(s.id)}
                      className={`w-full rounded-lg px-2 py-1.5 text-left text-sm ${
                        conversationId === s.id
                          ? "bg-chef-sage-light font-medium text-chef-sage-dark"
                          : "hover:bg-chef-muted"
                      }`}
                    >
                      <span className="block truncate">{s.title || "Chat"}</span>
                      <span className="block truncate text-xs text-chef-text-muted">
                        {s.preview}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {expanded && (
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <p className="text-sm text-chef-text-muted">
                Try: &ldquo;How much bacon do we have left?&rdquo; or &ldquo;What&apos;s expiring
                soon?&rdquo; Up to {maxSessions} chats are saved for you.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "ml-auto bg-chef-sage text-white"
                    : "bg-chef-muted text-chef-text"
                }`}
              >
                {m.content}
              </div>
            ))}
            {loading && <p className="text-sm text-chef-text-muted">Sous Chef is thinking…</p>}
            <div ref={bottomRef} />
          </div>
        )}

        <form onSubmit={send} className="flex gap-2 p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => messages.length > 0 && setExpanded(true)}
            placeholder="Ask Sous Chef about inventory, menu, or reorders…"
            className="flex-1 rounded-xl border border-chef-border px-4 py-3 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="sc-btn-primary py-3 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
