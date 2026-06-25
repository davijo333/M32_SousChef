import type { DashboardChatContext } from "@/lib/dashboard-chat";

const BRAND = "/brand";

/** Public paths for Sous Chef and agent avatars (see public/brand/). */
export const AGENT_ICONS = {
  sousChef: `${BRAND}/app-logo/icon.png`,
  headChef: `${BRAND}/head-chef/icon.png`,
  inventory: `${BRAND}/inventory-agent/icon.png`,
  business: `${BRAND}/business-agent/icon.png`,
  creative: `${BRAND}/creative-agent/icon.png`,
} as const;

export type AgentIconKey = keyof typeof AGENT_ICONS;

export type AgentTabId = "head_chef" | "inventory" | "business" | "creative";

export type AgentBrandAgent = AgentTabId | DashboardChatContext;

export const CHAT_CONTEXT_AGENT_ICON: Record<DashboardChatContext, string> = {
  head: AGENT_ICONS.headChef,
  inventory: AGENT_ICONS.inventory,
  business: AGENT_ICONS.business,
  create: AGENT_ICONS.creative,
};

export const AGENT_TAB_ICONS = {
  head_chef: AGENT_ICONS.headChef,
  inventory: AGENT_ICONS.inventory,
  business: AGENT_ICONS.business,
  creative: AGENT_ICONS.creative,
} as const;

/** UI labels for agents; Sous Chef for supervisor chat. */
export function agentBrandLabel(agent: AgentBrandAgent | "sousChef" | "headChef"): string {
  switch (agent) {
    case "inventory":
      return "Inventory";
    case "business":
      return "Business";
    case "create":
    case "creative":
      return "Creative";
    case "head_chef":
    case "headChef":
    case "head":
    case "sousChef":
      return "Sous Chef";
    default:
      return "Sous Chef";
  }
}

export function agentIconAlt(agent: AgentBrandAgent | "sousChef" | "headChef"): string {
  if (agent === "sousChef") return "Sous Chef";
  return agentBrandLabel(agent as AgentBrandAgent);
}
