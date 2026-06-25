"use client";

import { AgentCircleCard } from "@/components/BrandMark";
import { Tooltip } from "@/components/ui/Tooltip";
import { dashboardChatContextToBrandAgent } from "@backend/services/agents/chat-handoff";
import {
  CHAT_ASSISTANT_NAMES,
  DASHBOARD_CHAT_CONTEXTS,
  type DashboardChatContext,
} from "@backend/services/agents/dashboard-chat";

type AgentSwitcherProps = {
  active: DashboardChatContext;
  onSelect: (agent: DashboardChatContext) => void;
  disabled?: boolean;
  /** `compact` = smaller icons for the collapsed dock bar. */
  size?: "compact" | "default";
};

export function AgentSwitcher({
  active,
  onSelect,
  disabled = false,
  size = "default",
}: AgentSwitcherProps) {
  const iconSize = size === "compact" ? 32 : 36;
  const options = DASHBOARD_CHAT_CONTEXTS.filter((agent) => agent !== active);
  if (options.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="tablist"
      aria-label="Switch agent"
    >
      {options.map((agent) => (
        <Tooltip key={agent} content={CHAT_ASSISTANT_NAMES[agent]}>
          <button
            type="button"
            role="tab"
            aria-selected={false}
            aria-label={CHAT_ASSISTANT_NAMES[agent]}
            disabled={disabled}
            onClick={() => onSelect(agent)}
            className="shrink-0 rounded-full transition hover:opacity-100 disabled:opacity-40"
          >
            <AgentCircleCard
              agent={dashboardChatContextToBrandAgent(agent)}
              size={iconSize}
            />
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
