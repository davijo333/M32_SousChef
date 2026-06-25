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
  return /\b(yes|confirm|go ahead|do it|build it|create them|add them|add the|yes add)\b/i.test(
    message
  );
}

export function detectPantryAddZeroConfirm(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (!text) return false;
  const hasAdd = /\b(add|create)\b.+\b(ingredient|ingredients|pantry)\b/i.test(text);
  const hasZero =
    /\b(qty|quantity)\s*0\b/i.test(text) ||
    /\b(zero|0)\b.+\b(qty|quantity)\b/i.test(text);
  return hasAdd && hasZero;
}

/** Confirmed kitchen build from Sous Chef (head) or Creative when a dish draft/plan is active. */
export function detectKitchenBuildConfirm(
  message: string,
  options?: { hasCatalogDish?: boolean; hasRecipePlan?: boolean }
): boolean {
  if (detectPantryAddZeroConfirm(message) && options?.hasCatalogDish) {
    return true;
  }
  if (!detectRecipeFinalizeConfirm(message)) return false;
  return (
    detectRecipeBuildIntent(message) ||
    Boolean(options?.hasCatalogDish) ||
    Boolean(options?.hasRecipePlan) ||
    /\b(dish|ingredient|recipe|menu item)\b/i.test(message)
  );
}

export function shouldUseSuggestionConfirmOnly(message: string): boolean {
  if (detectRecipeBuildIntent(message)) return false;
  return /\b(save (it|that|this)|put it in suggestions?|suggest(?:ed)? only)\b/i.test(message);
}
