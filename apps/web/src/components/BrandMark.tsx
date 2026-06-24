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
  const src =
    agent === "inventory"
      ? AGENT_ICONS.inventory
      : agent === "business"
        ? AGENT_ICONS.business
        : agent === "creative" || agent === "create"
          ? AGENT_ICONS.creative
          : agent === "head" || agent === "head_chef" || agent === "headChef"
            ? AGENT_ICONS.headChef
            : AGENT_ICONS.headChef;

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
