"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AgentCircleCard } from "@/components/BrandMark";
import { DashboardChefChat } from "@/components/DashboardChefChat";
import { Tooltip } from "@/components/ui/Tooltip";
import { CHAT_ASSISTANT_NAMES } from "@backend/services/agents/dashboard-chat";
import type { DashboardFinancePeriod } from "@backend/services/dashboard/dashboard-stats";

export type AgentChatDockProps = {
  financeView?: DashboardFinancePeriod;
  showCues?: boolean;
  showAttachments?: boolean;
};

/** Floating Sous Chef chat — bottom-right icon until opened. */
export function AgentChatDock({
  financeView = "week",
  showCues = false,
  showAttachments = true,
}: AgentChatDockProps) {
  const [floatingOpen, setFloatingOpen] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);

  const FAB_OFFSET = "5.5rem";
  const agentLabel = CHAT_ASSISTANT_NAMES.head;

  const syncDockOffset = useCallback((heightPx: number) => {
    const gap = 16;
    document.documentElement.style.setProperty(
      "--sc-chat-dock-offset",
      `${Math.ceil(heightPx + gap)}px`
    );
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("sc-agent-chat-floating");
    return () => {
      document.documentElement.classList.remove("sc-agent-chat-floating");
      document.documentElement.style.removeProperty("--sc-chat-dock-offset");
    };
  }, []);

  useEffect(() => {
    if (!floatingOpen) {
      document.documentElement.style.setProperty("--sc-chat-dock-offset", FAB_OFFSET);
      return;
    }

    const el = dockRef.current;
    if (!el) return;

    const update = () => syncDockOffset(el.getBoundingClientRect().height);

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);

    return () => observer.disconnect();
  }, [floatingOpen, syncDockOffset]);

  useEffect(() => {
    if (!floatingOpen) return;

    let frame2 = 0;
    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: "smooth",
        });
      });
    });

    return () => {
      cancelAnimationFrame(frame1);
      if (frame2) cancelAnimationFrame(frame2);
    };
  }, [floatingOpen]);

  if (!floatingOpen) {
    return (
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6"
        aria-label={`${agentLabel} chat`}
      >
        <Tooltip content={`Open ${agentLabel} chat`}>
          <button
            type="button"
            onClick={() => setFloatingOpen(true)}
            className="pointer-events-auto shrink-0 rounded-full transition hover:opacity-95"
            aria-label={`Open ${agentLabel} chat`}
          >
            <AgentCircleCard agent="head" size={72} highlighted priority />
          </button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div
      ref={dockRef}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 pb-4 sm:pb-6"
      aria-label={`${agentLabel} chat`}
    >
      <div className="pointer-events-auto sc-page-shell">
        <div className="flex items-end gap-3 sm:relative sm:block sm:w-full">
          <div className="mb-3 flex shrink-0 flex-col items-center sm:absolute sm:bottom-4 sm:right-full sm:mr-3 sm:mb-0">
            <button
              type="button"
              onClick={() => setFloatingOpen(false)}
              className="shrink-0 rounded-full transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chef-sage/40"
              aria-label="Minimize chat"
            >
              <AgentCircleCard agent="head" size={88} highlighted priority />
            </button>
          </div>
          <div className="min-w-0 flex-1 sm:w-full">
            <DashboardChefChat
              financeView={financeView}
              showCues={showCues}
              showAttachments={showAttachments}
              hideHeaderIdentity
              variant="floating"
              onRequestClose={() => setFloatingOpen(false)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
