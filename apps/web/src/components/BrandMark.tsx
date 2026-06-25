import Image from "next/image";
import {
  AGENT_ICONS,
  agentBrandLabel,
  agentIconAlt,
  type AgentBrandAgent,
} from "@/lib/agent-icons";

type AppBrandMarkProps = {
  height?: number;
  className?: string;
  priority?: boolean;
};

/** Full horizontal app logo — no circle crop. */
export function AppBrandMark({ height = 36, className = "", priority = false }: AppBrandMarkProps) {
  const width = Math.round(height * (764 / 234));
  return (
    <span
      className={`relative inline-block shrink-0 ${className}`}
      style={{ width, height }}
    >
      <Image
        src={AGENT_ICONS.sousChef}
        alt={agentIconAlt("sousChef")}
        fill
        priority={priority}
        unoptimized
        sizes={`${width}px`}
        className="object-contain object-left"
      />
    </span>
  );
}

type AgentBrandMarkProps = {
  agent: AgentBrandAgent;
  size?: number;
  className?: string;
  priority?: boolean;
};

/** Full agent logo — no circle crop. */
export function AgentBrandMark({
  agent,
  size = 48,
  className = "",
  priority = false,
}: AgentBrandMarkProps) {
  const src = agentIconSrc(agent);
  const alt = agentBrandLabel(agent);

  return (
    <span
      className={`relative inline-block shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        unoptimized
        sizes={`${size}px`}
        className="object-contain object-center"
      />
    </span>
  );
}

function agentIconSrc(agent: AgentBrandAgent): string {
  if (agent === "inventory") return AGENT_ICONS.inventory;
  if (agent === "business") return AGENT_ICONS.business;
  if (agent === "creative" || agent === "create") return AGENT_ICONS.creative;
  return AGENT_ICONS.headChef;
}

type AgentCircleCardProps = AgentBrandMarkProps & {
  /** Emphasize as the active / current agent. */
  highlighted?: boolean;
};

/** Agent logo in a fixed square circle card (chat FAB, dock avatar, switcher). */
export function AgentCircleCard({
  agent,
  size = 48,
  className = "",
  priority = false,
  highlighted = false,
}: AgentCircleCardProps) {
  const src = agentIconSrc(agent);
  const alt = agentBrandLabel(agent);

  return (
    <span
      className={`relative box-border inline-block shrink-0 overflow-hidden rounded-full border-2 bg-white shadow-[0_4px_14px_rgba(42,38,34,0.1)] ${
        highlighted
          ? "border-chef-sage ring-2 ring-chef-sage/25"
          : "border-chef-sage/50"
      } ${className}`}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        unoptimized
        sizes={`${size}px`}
        className="object-contain object-center p-[11%]"
      />
    </span>
  );
}

type AgentSectionHeaderProps = {
  agent: AgentBrandAgent;
  logoSize?: number;
  className?: string;
  titleClassName?: string;
  align?: "start" | "center";
};

/** Section title: logo above "{Name} Agent" (or Sous Chef). */
export function AgentSectionHeader({
  agent,
  logoSize = 72,
  className = "",
  titleClassName = "text-xl font-semibold text-chef-text sm:text-2xl",
  align = "center",
}: AgentSectionHeaderProps) {
  return (
    <div
      className={`flex flex-col gap-2 ${
        align === "center" ? "items-center text-center" : "items-start"
      } ${className}`}
    >
      <AgentBrandMark agent={agent} size={logoSize} />
      <h2 className={titleClassName}>{agentBrandLabel(agent)}</h2>
    </div>
  );
}
