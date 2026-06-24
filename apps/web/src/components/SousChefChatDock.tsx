"use client";

import { useState } from "react";
import { AgentBrandMark } from "@/components/BrandMark";
import { DashboardChefChat } from "@/components/DashboardChefChat";
import { dashboardChatContextToBrandAgent } from "@/lib/chat-handoff";
import type { DashboardChatContext } from "@/lib/dashboard-chat";

import type { DashboardFinancePeriod } from "@/lib/dashboard-stats";

type SousChefChatDockProps = {
  financeView?: DashboardFinancePeriod;
  showCues?: boolean;
  dashboardSection?: "inventory" | "business" | "create";
  onAgentHandoff?: (section: "inventory" | "business" | "create") => void;
};

/** Fixed bottom-center Sous Chef chat — width matches dashboard tab row (max-w-6xl). */
export function SousChefChatDock({
  financeView = "week",
  showCues = false,
  dashboardSection,
  onAgentHandoff,
}: SousChefChatDockProps) {
  const [agentContext, setAgentContext] = useState<DashboardChatContext>("head");
  const connectedToSpecialist = agentContext !== "head";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 pb-4 sm:pb-6"
      aria-label="Sous Chef chat"
    >
      <div className="pointer-events-auto mx-auto flex w-full max-w-6xl items-end gap-3 px-4 sm:gap-4">
        <div className="mb-3 flex shrink-0 flex-col items-center gap-2 sm:mb-4">
          <AgentBrandMark
            agent={dashboardChatContextToBrandAgent(agentContext)}
            size={88}
          />
          {connectedToSpecialist && (
            <button
              type="button"
              onClick={() => setAgentContext("head")}
              className="max-w-[5.5rem] rounded-full border border-chef-border bg-white px-2 py-1 text-center text-[10px] font-medium leading-tight text-chef-text hover:border-chef-sage hover:bg-chef-sage-light/30"
            >
              Connect back to Sous Chef
            </button>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <DashboardChefChat
            context="head"
            variant="dock"
            financeView={financeView}
            showCues={showCues}
            hideHeaderIdentity
            dashboardSection={dashboardSection}
            agentContext={agentContext}
            onAgentContextChange={setAgentContext}
            onAgentHandoff={onAgentHandoff}
          />
        </div>
      </div>
    </div>
  );
}
