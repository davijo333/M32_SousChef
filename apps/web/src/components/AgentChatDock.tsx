"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AgentCircleCard } from "@/components/BrandMark";
import { DashboardChefChat } from "@/components/DashboardChefChat";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  connectBackButtonLabel,
  dashboardChatContextToBrandAgent,
} from "@backend/services/agents/chat-handoff";
import {
  CHAT_ASSISTANT_NAMES,
  type DashboardChatContext,
} from "@backend/services/agents/dashboard-chat";
import type { DashboardFinancePeriod } from "@backend/services/dashboard/dashboard-stats";

export type AgentChatDockProps = {
  /** Starts minimized — bottom-right icon until opened. */
  chatContext: DashboardChatContext;
  /** Agent shown on open (defaults to `chatContext`). */
  defaultAgent?: DashboardChatContext;
  financeView?: DashboardFinancePeriod;
  showCues?: boolean;
  showAttachments?: boolean;
  dashboardSection?: "inventory" | "business" | "create";
  onAgentHandoff?: (section: "inventory" | "business" | "create") => void;
};

export function AgentChatDock({
  chatContext,
  defaultAgent,
  financeView = "week",
  showCues = false,
  showAttachments,
  dashboardSection,
  onAgentHandoff,
}: AgentChatDockProps) {
  const resolvedDefault = defaultAgent ?? chatContext;
  const [agentContext, setAgentContext] = useState<DashboardChatContext>(resolvedDefault);
  const [floatingOpen, setFloatingOpen] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);

  const FAB_OFFSET = "5.5rem";

  const syncDockOffset = useCallback((heightPx: number) => {
    const gap = 16;
    document.documentElement.style.setProperty(
      "--sc-chat-dock-offset",
      `${Math.ceil(heightPx + gap)}px`
    );
  }, []);

  useEffect(() => {
    setAgentContext(resolvedDefault);
  }, [resolvedDefault, chatContext]);

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

  const homeAgent = resolvedDefault;
  const showConnectBack = agentContext !== homeAgent;
  const brandAgent = dashboardChatContextToBrandAgent(agentContext);
  const agentLabel = CHAT_ASSISTANT_NAMES[agentContext];

  function openChat() {
    setFloatingOpen(true);
  }

  function minimizeChat() {
    setFloatingOpen(false);
  }

  if (!floatingOpen) {
    return (
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6"
        aria-label={`${agentLabel} chat`}
      >
        <Tooltip content={`Open ${agentLabel} chat`}>
          <button
            type="button"
            onClick={openChat}
            className="pointer-events-auto shrink-0 rounded-full transition hover:opacity-95"
            aria-label={`Open ${agentLabel} chat`}
          >
            <AgentCircleCard agent={brandAgent} size={72} highlighted priority />
          </button>
        </Tooltip>
      </div>
    );
  }

  const agentColumn = (
    <div className="flex shrink-0 flex-col items-center gap-2 sm:absolute sm:bottom-4 sm:right-full sm:mr-3">
      <button
        type="button"
        onClick={minimizeChat}
        className="shrink-0 rounded-full transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chef-sage/40"
        aria-label="Minimize chat"
      >
        <AgentCircleCard agent={brandAgent} size={88} highlighted priority />
      </button>
      {showConnectBack && (
        <button
          type="button"
          onClick={() => setAgentContext(homeAgent)}
          className="max-w-[5.5rem] rounded-full border border-chef-border bg-white px-2 py-1 text-center text-[10px] font-medium leading-tight text-chef-text hover:border-chef-sage hover:bg-chef-sage-light/30"
        >
          {connectBackButtonLabel(homeAgent)}
        </button>
      )}
    </div>
  );

  return (
    <div
      ref={dockRef}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 pb-4 sm:pb-6"
      aria-label={`${CHAT_ASSISTANT_NAMES[agentContext]} chat`}
    >
      <div className="pointer-events-auto sc-page-shell">
        <div className="flex items-end gap-3 sm:relative sm:block sm:w-full">
          <div className="mb-3 sm:mb-0">{agentColumn}</div>
          <div className="min-w-0 flex-1 sm:w-full">
            <DashboardChefChat
              context={chatContext}
              homeAgent={homeAgent}
              variant="floating"
              financeView={financeView}
              showCues={showCues}
              showAttachments={showAttachments}
              hideHeaderIdentity
              dashboardSection={dashboardSection}
              agentContext={agentContext}
              onAgentContextChange={setAgentContext}
              onAgentHandoff={onAgentHandoff}
              onRequestClose={minimizeChat}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
