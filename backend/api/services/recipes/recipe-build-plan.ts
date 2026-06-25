export type RecipeBuildIngredientOption = {
  label: string;
  brandName?: string;
  store?: string;
  imageUrl: string;
  score?: number;
};

export type RecipeBuildIngredientRow = {
  key: string;
  name: string;
  qtyPerServing: number;
  unit: string;
  pantrySlug?: string;
  pantryName?: string;
  committedSlug?: string;
  searchQuery?: string;
  options?: RecipeBuildIngredientOption[];
  selectedOption?: RecipeBuildIngredientOption;
};

export type RecipeBuildPlanPayload = {
  dishName: string;
  description?: string;
  /** Creative Agent prose for dish photo styling — passed to image generation, not shown as image picks in chat. */
  visualBrief?: string;
  classification?: string;
  sellPrice?: number | null;
  instructions?: string[];
  ingredients: RecipeBuildIngredientRow[];
  status: "selecting" | "ready_to_finalize";
};

export function ingredientsNeedingPick(plan: RecipeBuildPlanPayload): RecipeBuildIngredientRow[] {
  return plan.ingredients.filter(
    (row) =>
      !row.committedSlug &&
      !row.pantrySlug &&
      !row.selectedOption &&
      (row.options?.length ?? 0) > 0
  );
}

export function formatRecipeBuildSelectionSummary(plan: RecipeBuildPlanPayload): string {
  const lines = plan.ingredients.map((row) => {
    const pick =
      row.selectedOption?.label?.trim() ||
      row.pantryName ||
      row.committedSlug ||
      row.pantrySlug ||
      row.name;
    const store = row.selectedOption?.store ? ` (${row.selectedOption.store})` : "";
    return `- **${row.name}** — ${row.qtyPerServing} ${row.unit} → ${pick}${store}`;
  });
  return [`**${plan.dishName}** — ingredients ready:`, ...lines].join("\n");
}

export function isRecipeBuildReadyToFinalize(plan: RecipeBuildPlanPayload): boolean {
  return Boolean(plan.dishName?.trim()) && (plan.ingredients?.length ?? 0) > 0;
}

export function applyRecipeSelectionToPlan(
  plan: RecipeBuildPlanPayload,
  ingredientKey: string,
  optionIndex: number
): RecipeBuildPlanPayload {
  const ingredients = plan.ingredients.map((row) => {
    if (row.key !== ingredientKey) return row;
    const chosen = row.options?.[optionIndex - 1];
    if (!chosen) return row;
    return { ...row, selectedOption: chosen };
  });
  const needsPick = ingredientsNeedingPick({ ...plan, ingredients }).length > 0;
  return {
    ...plan,
    ingredients,
    status: needsPick ? "selecting" : "ready_to_finalize",
  };
}

const PREP_PREFIX =
  /^(?:ripe|fresh|frozen|diced|sliced|chopped|crushed|whole|organic|raw|unsweetened|sweetened|plain|low[- ]fat|non[- ]fat|fat[- ]free|large|small|medium)\s+/i;

const FORM_MAP: Record<string, string> = {
  "ice cubes": "Ice",
  "ice cube": "Ice",
  "crushed ice": "Ice",
  "bagged ice": "Ice",
};

function titleCaseIngredient(text: string): string {
  const small = new Set(["and", "or", "with", "of", "in"]);
  return text
    .split(/\s+/)
    .map((w) => (small.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

/** Strip recipe prep words — pantry uses store-style names (Mango, not Ripe Mango). */
export function basicPantryIngredientName(name: string): string {
  let text = name.replace(/\s*\([^)]*\)/g, "").trim();
  const lower = text.replace(/\s+/g, " ").trim().toLowerCase();
  for (const [phrase, canonical] of Object.entries(FORM_MAP).sort((a, b) => b[0].length - a[0].length)) {
    if (lower === phrase || lower.includes(phrase)) return canonical;
  }
  let cleaned = text;
  for (;;) {
    const next = cleaned.replace(PREP_PREFIX, "").trim();
    if (next === cleaned) break;
    cleaned = next;
  }
  return cleaned ? titleCaseIngredient(cleaned) : name.trim();
}

/** Grocery search phrasing for product photos. */
export function ingredientSearchQuery(basicName: string): string {
  const lower = basicName.trim().toLowerCase();
  if (lower === "ice" || lower === "ice cubes" || lower === "ice cube") {
    return "bagged ice cubes grocery";
  }
  return basicName.trim();
}

export function applyRefreshedIngredientOptions(
  plan: RecipeBuildPlanPayload,
  ingredientKey: string,
  searchQuery: string,
  options: RecipeBuildIngredientOption[]
): RecipeBuildPlanPayload {
  const ingredients = plan.ingredients.map((row) => {
    if (row.key !== ingredientKey) return row;
    return {
      ...row,
      searchQuery: searchQuery.trim(),
      options,
      selectedOption: undefined,
    };
  });
  return {
    ...plan,
    ingredients,
    status: "selecting",
  };
}
