"use client";

import type { CreateCue } from "@/lib/create-cues";
import { CUE_KIND_LABELS } from "@/lib/create-cues";
import { Tooltip } from "@/components/ui/Tooltip";

export const CUE_STYLES: Record<CreateCue["kind"], string> = {
  day: "border-chef-sage/30 bg-chef-sage-light/40",
  weather: "border-sky-200 bg-sky-50",
  holiday: "border-chef-amber/40 bg-chef-amber-light/50",
  season: "border-emerald-200 bg-emerald-50",
  ingredient: "border-lime-200 bg-lime-50",
  pantry: "border-rose-200 bg-rose-50",
};

type CreativeCueCardProps = {
  cue: CreateCue;
  onSelect: (cue: CreateCue) => void;
  compact?: boolean;
};

export function CreativeCueCard({ cue, onSelect, compact = true }: CreativeCueCardProps) {
  return (
    <Tooltip content={`${cue.label} — ${cue.detail}`}>
      <button
        type="button"
        onClick={() => onSelect(cue)}
        className={`sc-card w-full text-left transition hover:shadow-sm ${CUE_STYLES[cue.kind]} ${
          compact ? "p-3" : "p-4"
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-chef-text-muted">
          {CUE_KIND_LABELS[cue.kind]}
        </p>
        <p className="mt-0.5 text-sm font-semibold text-chef-text">{cue.label}</p>
        <p className="mt-1 line-clamp-2 text-xs leading-snug text-chef-text-muted">{cue.detail}</p>
      </button>
    </Tooltip>
  );
}
