"use client";

import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { InfoModal } from "@/components/ui/InfoModal";
import { Tooltip } from "@/components/ui/Tooltip";

type SectionInfoProps = {
  title: string;
  children: ReactNode;
  className?: string;
};

export function SectionInfo({ title, children, className = "" }: SectionInfoProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip content="More information" side="bottom-right">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setOpen(true);
          }}
          className={`sc-icon-btn h-9 w-9 rounded-full border border-chef-border bg-white text-chef-sage hover:bg-chef-sage-light/40 ${className}`}
          aria-label={`About ${title}`}
        >
          <Info className="h-5 w-5" strokeWidth={2.25} />
        </button>
      </Tooltip>
      <InfoModal open={open} onClose={() => setOpen(false)} title={title}>
        {children}
      </InfoModal>
    </>
  );
}
