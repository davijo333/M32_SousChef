/** Detect full kitchen recipe build vs save-to-suggested only. */

export function detectRecipeBuildIntent(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  return (
    /\b(add|create|build)\b.+\b(dish|recipe|menu item)\b.+\b(ingredient|pantry|recipe)/i.test(
      text
    ) ||
    /\b(ingredient|pantry).+\b(and|&).+\b(dish|recipe)/i.test(text) ||
    /\blink\b.+\bingredient/i.test(text) ||
    /\badd\b.+\bto\s+(kitchen|pantry|menu)\b/i.test(text)
  );
}

export function detectRecipeFinalizeConfirm(message: string): boolean {
  return /\b(yes|confirm|go ahead|do it|build it|create them|add them)\b/i.test(message);
}

export function shouldUseSuggestionConfirmOnly(message: string): boolean {
  if (detectRecipeBuildIntent(message)) return false;
  return /\b(save (it|that|this)|put it in suggestions?|suggest(?:ed)? only)\b/i.test(message);
}
