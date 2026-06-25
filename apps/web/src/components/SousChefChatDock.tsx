"use client";

import { AgentChatDock, type AgentChatDockProps } from "@/components/AgentChatDock";

type SousChefChatDockProps = Omit<
  AgentChatDockProps,
  "chatContext" | "defaultAgent"
>;

/** Sous Chef chat — starts minimized; floating icon bottom-right like other pages. */
export function SousChefChatDock(props: SousChefChatDockProps) {
  return (
    <AgentChatDock
      chatContext="head"
      defaultAgent="head"
      showAttachments
      {...props}
    />
  );
}
