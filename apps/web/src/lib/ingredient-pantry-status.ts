export type PantryStatus = "active" | "inactive" | "required";

export const PANTRY_STATUS_OPTIONS: { value: PantryStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "required", label: "Required" },
];

type IngredientStatusInput = {
  label?: string;
  currentQty: number;
  reorderThreshold: number;
};

export function isIngredientRequired(item: IngredientStatusInput): boolean {
  if (item.currentQty <= item.reorderThreshold) return true;
  if (item.label === "new" && item.currentQty === 0) return true;
  return false;
}

export function matchesPantryStatus(
  item: IngredientStatusInput,
  status: PantryStatus
): boolean {
  if (status === "active") return item.label === "used";
  if (status === "inactive") return item.label === "unused";
  if (status === "required") return isIngredientRequired(item);
  return false;
}

export function matchesAnyPantryStatus(
  item: IngredientStatusInput,
  statuses: PantryStatus[]
): boolean {
  return statuses.some((status) => matchesPantryStatus(item, status));
}
