export const KITCHEN_NAME_MIN = 2;
export const KITCHEN_NAME_MAX = 80;
export const PLACEHOLDER_KITCHEN_NAME = "My Kitchen";

export function normalizeKitchenNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function validateKitchenName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < KITCHEN_NAME_MIN) {
    return `Kitchen name must be at least ${KITCHEN_NAME_MIN} characters.`;
  }
  if (trimmed.length > KITCHEN_NAME_MAX) {
    return `Kitchen name must be at most ${KITCHEN_NAME_MAX} characters.`;
  }
  return null;
}
