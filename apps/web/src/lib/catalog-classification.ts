export type ClassifiedGroup<T> = {
  classKey: string;
  classLabel: string;
  subclasses: {
    subclassKey: string;
    subclassLabel: string;
    items: T[];
  }[];
};

const BEVERAGE_SUBCLASSES = new Set(["coffee", "tea", "juice"]);

export function formatClassificationLabel(value: string): string {
  if (value === "addon") return "Add-on";
  if (value === "sandwich") return "Sandwich";
  if (value === "beverage" || BEVERAGE_SUBCLASSES.has(value)) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  if (value === "general") return "General";
  if (value === "other") return "Other";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function dishClassKey(classification: string): string {
  const c = classification.trim().toLowerCase() || "other";
  if (BEVERAGE_SUBCLASSES.has(c) || c === "beverage") return "beverage";
  if (c === "sandwich") return "sandwich";
  return c;
}

export function dishSubclassKey(classification: string): string {
  const c = classification.trim().toLowerCase() || "other";
  if (BEVERAGE_SUBCLASSES.has(c) || c === "beverage") return "beverage";
  if (c === "sandwich") return "sandwich";
  return c;
}

const INGREDIENT_CLASS_BY_CATEGORY: Record<string, string> = {
  bakery: "food",
  protein: "food",
  dairy: "food",
  produce: "food",
  pantry: "food",
  coffee: "beverage",
  tea: "beverage",
  juice: "beverage",
  syrup: "beverage",
  beverage: "beverage",
  misc: "other",
};

export function ingredientClassKey(category: string): string {
  const c = category.trim().toLowerCase() || "misc";
  return INGREDIENT_CLASS_BY_CATEGORY[c] ?? "other";
}

export function ingredientSubclassKey(category: string): string {
  return category.trim().toLowerCase() || "misc";
}

export function ingredientClassLabel(classKey: string): string {
  if (classKey === "food") return "Food";
  if (classKey === "beverage") return "Beverages";
  return formatClassificationLabel(classKey);
}

export function dishClassLabel(classKey: string): string {
  if (classKey === "beverage") return "Beverages";
  if (classKey === "sandwich") return "Sandwiches";
  return formatClassificationLabel(classKey);
}

export function groupByClassSubclass<T>(
  items: T[],
  getClassKey: (item: T) => string,
  getSubclassKey: (item: T) => string,
  classLabelFn: (classKey: string) => string,
  subclassLabelFn: (subclassKey: string) => string
): ClassifiedGroup<T>[] {
  const byClass = new Map<string, Map<string, T[]>>();

  for (const item of items) {
    const classKey = getClassKey(item);
    const subclassKey = getSubclassKey(item);
    if (!byClass.has(classKey)) byClass.set(classKey, new Map());
    const bySubclass = byClass.get(classKey)!;
    if (!bySubclass.has(subclassKey)) bySubclass.set(subclassKey, []);
    bySubclass.get(subclassKey)!.push(item);
  }

  return Array.from(byClass.entries())
    .sort(([a], [b]) => classLabelFn(a).localeCompare(classLabelFn(b)))
    .map(([classKey, subclassMap]) => ({
      classKey,
      classLabel: classLabelFn(classKey),
      subclasses: Array.from(subclassMap.entries())
        .sort(([a], [b]) => subclassLabelFn(a).localeCompare(subclassLabelFn(b)))
        .map(([subclassKey, subclassItems]) => ({
          subclassKey,
          subclassLabel: subclassLabelFn(subclassKey),
          items: subclassItems.sort((a, b) => {
            const aName = (a as { name?: string }).name ?? "";
            const bName = (b as { name?: string }).name ?? "";
            return aName.localeCompare(bName);
          }),
        })),
    }));
}

export const INGREDIENT_CATEGORY_OPTIONS = [
  { value: "bakery", label: "Bakery" },
  { value: "dairy", label: "Dairy" },
  { value: "produce", label: "Produce" },
  { value: "protein", label: "Protein" },
  { value: "coffee", label: "Coffee" },
  { value: "tea", label: "Tea" },
  { value: "juice", label: "Juice" },
  { value: "syrup", label: "Syrup" },
  { value: "pantry", label: "Pantry" },
  { value: "misc", label: "Other" },
] as const;

const INGREDIENT_CATEGORY_VALUES = new Set(
  INGREDIENT_CATEGORY_OPTIONS.map((o) => o.value)
);

function billText(name: string, rawName?: string): string {
  return `${name} ${rawName ?? ""}`.toLowerCase();
}

/** Infer dish menu class from POS line text when the parser omits classification. */
export function inferDishClassification(name: string, rawName?: string): string {
  const text = billText(name, rawName);
  if (/\b(coffee|espresso|frappe|mocha|cappuccino|latte|americano)\b/.test(text)) {
    return "coffee";
  }
  if (/\b(tea|chai)\b/.test(text)) return "tea";
  if (/\b(juice)\b/.test(text)) return "juice";
  if (/\b(bagel|croissant|sandwich|sourdough|stack|byo|build[\s-]?your[\s-]?own|melt)\b/.test(text)) {
    return "sandwich";
  }
  return "other";
}

/** Infer add-on class (cheese, protein, veggie, coffee, …) from line text. */
export function inferAddOnClassification(name: string, rawName?: string): string {
  const text = billText(name, rawName);
  if (/\b(cheese|cheddar|swiss|american|provolone)\b/.test(text)) return "cheese";
  if (/\b(bacon|sausage|egg|ham|turkey|protein)\b/.test(text)) return "protein";
  if (/\b(spinach|tomato|pepper|veggie|avocado|onion)\b/.test(text)) return "veggie";
  if (/\b(whipped|cream|syrup|shot|milk|foam)\b/.test(text)) return "coffee";
  return "addon";
}

/** Infer pantry category for supplier invoice lines. */
export function inferIngredientCategory(name: string, rawName?: string): string {
  const text = billText(name, rawName);
  if (/\b(croissant|bagel|bread|loaf|muffin|bakery|roll)\b/.test(text)) return "bakery";
  if (/\b(bacon|sausage|egg|chicken|ham|protein|meat)\b/.test(text)) return "protein";
  if (/\b(milk|cheese|butter|cream|dairy|yogurt)\b/.test(text)) return "dairy";
  if (/\b(spinach|tomato|pepper|avocado|produce|lettuce|onion)\b/.test(text)) {
    return "produce";
  }
  if (/\b(coffee|espresso|bean)\b/.test(text)) return "coffee";
  if (/\b(tea)\b/.test(text)) return "tea";
  if (/\b(juice)\b/.test(text)) return "juice";
  if (/\b(syrup|monin)\b/.test(text)) return "syrup";
  if (/\b(oil|flour|sugar|salt|pantry)\b/.test(text)) return "pantry";
  return "misc";
}

export function normalizeIngredientCategory(value?: string): string {
  const c = (value ?? "").trim().toLowerCase();
  return INGREDIENT_CATEGORY_VALUES.has(c as (typeof INGREDIENT_CATEGORY_OPTIONS)[number]["value"])
    ? c
    : inferIngredientCategory(c);
}

/** POS context for image gen — raw line when it differs from the normalized name. */
export function billLineDescription(name: string, rawName: string): string | undefined {
  const raw = rawName.trim();
  const n = name.trim();
  if (!raw || raw.toLowerCase() === n.toLowerCase()) return undefined;
  return raw;
}
