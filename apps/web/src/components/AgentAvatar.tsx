import Image from "next/image";
import { AGENT_ICONS, agentIconAlt, type AgentBrandAgent } from "@/lib/agent-icons";

type AgentAvatarProps = {
  agent: AgentBrandAgent | "sousChef" | "headChef";
  size?: number;
  className?: string;
  priority?: boolean;
};

function resolveIcon(agent: AgentAvatarProps["agent"]): { src: string; alt: string } {
  switch (agent) {
    case "sousChef":
      return { src: AGENT_ICONS.sousChef, alt: agentIconAlt("sousChef") };
    case "headChef":
    case "head_chef":
    case "head":
      return { src: AGENT_ICONS.headChef, alt: agentIconAlt("head_chef") };
    case "inventory":
      return { src: AGENT_ICONS.inventory, alt: agentIconAlt("inventory") };
    case "business":
      return { src: AGENT_ICONS.business, alt: agentIconAlt("business") };
    case "create":
    case "creative":
      return { src: AGENT_ICONS.creative, alt: agentIconAlt("create") };
    default:
      return { src: AGENT_ICONS.headChef, alt: agentIconAlt("head_chef") };
  }
}

/** Small circular avatar — prefer BrandMark / AgentSectionHeader for section titles. */
export function AgentAvatar({
  agent,
  size = 32,
  className = "",
  priority = false,
}: AgentAvatarProps) {
  const { src, alt } = resolveIcon(agent);

  return (
    <span
      className={`relative inline-block shrink-0 overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-chef-border/70 ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes={`${size}px`}
        priority={priority}
        unoptimized
        className="object-cover object-center"
      />
    </span>
  );
}
