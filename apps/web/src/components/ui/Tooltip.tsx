"use client";

import type { ReactNode } from "react";

type TooltipProps = {
  content: string;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
};

export function Tooltip({ content, children, side = "top", className = "" }: TooltipProps) {
  if (!content) return <>{children}</>;

  const position =
    side === "top"
      ? "bottom-full left-1/2 mb-2 -translate-x-1/2"
      : "top-full left-1/2 mt-2 -translate-x-1/2";

  return (
    <span className={`group/tooltip relative inline-flex max-w-full ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-[60] w-max max-w-[16rem] rounded-lg bg-chef-text px-2.5 py-1.5 text-center text-xs font-medium leading-snug text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100 ${position}`}
      >
        {content}
      </span>
    </span>
  );
}
