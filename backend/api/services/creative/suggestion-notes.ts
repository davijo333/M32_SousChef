export const SUGGESTION_NOTE_KINDS = [
  "expiring_ingredients",
  "seasonal",
  "high_margin",
  "low_stock",
  "cue",
  "other",
] as const;

export type SuggestionNoteKind = (typeof SUGGESTION_NOTE_KINDS)[number];

export type SuggestionNote = {
  kind: SuggestionNoteKind;
  text: string;
};

export function isSuggestionNoteKind(value: string): value is SuggestionNoteKind {
  return SUGGESTION_NOTE_KINDS.includes(value as SuggestionNoteKind);
}

export function normalizeSuggestionNotes(raw: unknown): SuggestionNote[] {
  if (!Array.isArray(raw)) return [];

  const notes: SuggestionNote[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const kind = String((entry as { kind?: string }).kind ?? "").trim();
    const text = String((entry as { text?: string }).text ?? "").trim();
    if (!isSuggestionNoteKind(kind) || !text) continue;
    notes.push({ kind, text });
  }
  return notes;
}

export function suggestionNoteLabel(kind: SuggestionNoteKind): string {
  switch (kind) {
    case "expiring_ingredients":
      return "Expiring";
    case "seasonal":
      return "Seasonal";
    case "high_margin":
      return "High margin";
    case "low_stock":
      return "Use soon";
    case "cue":
      return "Today's cue";
    default:
      return "Note";
  }
}
