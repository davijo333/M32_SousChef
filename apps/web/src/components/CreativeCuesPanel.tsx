"use client";

import { useCallback, useEffect, useState } from "react";
import { CreativeCueCard } from "@/components/CreativeCueCard";
import { SectionInfo } from "@/components/ui/SectionInfo";
import { cueToChatPrompt, type CreateCue } from "@backend/services/creative/create-cues";
import { dispatchCreativeCueSelect } from "@backend/services/creative/creative-cue-events";

export function CreativeCuesPanel() {
  const [cues, setCues] = useState<CreateCue[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCues = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/create/cues");
      if (!res.ok) return;
      const data = (await res.json()) as { cues: CreateCue[] };
      setCues(data.cues);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCues();
  }, [loadCues]);

  const handleSelect = (cue: CreateCue) => {
    dispatchCreativeCueSelect(cueToChatPrompt(cue));
  };

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="sc-section-title">Cues for creativity</h2>
        <SectionInfo title="Cues for creativity">
          <p>
            Each cue reflects today&apos;s context — weather, season, holidays, pantry, and more.
            Tap a card to send it to chat and brainstorm a special.
          </p>
          <p className="mt-3">
            When you like an idea, say <strong>add it</strong> in chat to save it under{" "}
            <strong>Recipes → Suggested</strong>.
          </p>
        </SectionInfo>
      </div>

      {loading ? (
        <div className="mt-3 grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-20 animate-pulse rounded-2xl border border-chef-border bg-chef-muted/60"
            />
          ))}
        </div>
      ) : cues.length > 0 ? (
        <div className="mt-3 grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cues.map((cue) => (
            <CreativeCueCard key={cue.id} cue={cue} onSelect={handleSelect} />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-chef-text-muted">
          No cues available right now — ask Creative for ideas.
        </p>
      )}
    </section>
  );
}
