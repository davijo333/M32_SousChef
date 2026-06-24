import Image from "next/image";
import { AGENT_ICONS, agentIconAlt } from "@/lib/agent-icons";

/** Full-width app logo for login and signup (horizontal mark, tight crop). */
export function AuthBrandLogo() {
  return (
    <div className="flex w-full flex-col items-center">
      <div className="relative aspect-[13/4] w-full max-h-[264px] sm:max-h-[288px]">
        <Image
          src={AGENT_ICONS.sousChef}
          alt={agentIconAlt("sousChef")}
          fill
          priority
          unoptimized
        sizes="(max-width: 448px) 90vw, 368px"
          className="object-contain object-center"
        />
      </div>
      <p className="mt-3 text-center text-base leading-relaxed text-chef-text-muted">
        Your AI Sous Chef for your kitchen.
      </p>
    </div>
  );
}
