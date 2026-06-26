import type { ChatCatalogDraftPayload } from "@backend/services/chat/chat-catalog-draft";
import {
  cleanMenuDishName,
  creativeRecipeDraftText,
  inferRecipeDraftDishName,
  threadHasRecipeDraft,
} from "@backend/services/chat/chat-recipe-draft";
import type { RecipeBuildPlanPayload } from "@backend/services/recipes/recipe-build-plan";

function ingredientKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function normalizeUnit(unit: string): string {
  const cleaned = unit.trim().toLowerCase();
  if (cleaned === "cups") return "cup";
  if (cleaned === "slices") return "slice";
  if (cleaned === "grams" || cleaned === "gram") return "g";
  return cleaned || "each";
}

function inferQtyUnit(name: string): { qty: number; unit: string } {
  const lower = name.toLowerCase();
  if (/\bice\b/.test(lower)) return { qty: 1, unit: "cup" };
  if (/\b(juice|nectar)\b/.test(lower)) return { qty: 4, unit: "oz" };
  if (/\b(puree|purée|yogurt|mango|banana|berry|berries)\b/.test(lower)) {
    return { qty: 0.5, unit: "cup" };
  }
  if (/\b(milk|almond milk)\b/.test(lower)) return { qty: 1, unit: "cup" };
  if (/\b(honey|vanilla)\b/.test(lower)) return { qty: 1, unit: "tbsp" };
  if (/\b(extract)\b/.test(lower)) return { qty: 1, unit: "tsp" };
  return { qty: 1, unit: "each" };
}

function looksLikeIngredientLine(text: string): boolean {
  const lower = text.toLowerCase();
  if (
    /\b(processing|confirm|specialist|connect|suggested add-?on|why it fits|rationale|sell price|margin)\b/.test(
      lower
    )
  ) {
    return false;
  }
  if (/→/.test(text)) return false;
  if (/^\$?[\d.]+/.test(text.trim())) return false;
  return text.trim().length >= 2 && text.trim().length <= 120;
}

function parseIngredientLine(text: string): { name: string; qty: number; unit: string } | null {
  const raw = text.trim().replace(/\.$/, "");
  if (!raw || raw.length < 2 || !looksLikeIngredientLine(raw)) return null;
  if (/→/.test(raw)) return null;

  const qtyMatch = raw.match(
    /(\d+(?:\.\d+)?(?:\/\d+)?)\s*(cup|cups|oz|tbsp|tsp|ml|l|each|slice|slices|g|gram|grams)\b/i
  );
  let name = raw;
  let qty: number | null = null;
  let unit: string | null = null;

  if (qtyMatch) {
    qty = Number(qtyMatch[1].includes("/") ? evalFraction(qtyMatch[1]) : qtyMatch[1]);
    unit = normalizeUnit(qtyMatch[2]);
    name = raw.replace(qtyMatch[0], "").trim().replace(/^[-–—:\s]+|[-–—:\s]+$/g, "");
    name = name.replace(/\s*→.*$/, "").trim();
  } else {
    name = raw.replace(/\s*\([^)]*\)\s*/g, " ").trim().replace(/^[-–—:\s]+|[-–—:\s]+$/g, "");
    name = name.replace(/\s*→.*$/, "").trim();
  }

  name = name.replace(/^(optional|for topping)\s*[:\-]?\s*/i, "").trim();
  if (!name || name.length < 2) return null;

  if (qty == null || !unit) {
    const inferred = inferQtyUnit(name);
    qty = inferred.qty;
    unit = inferred.unit;
  }

  return { name, qty, unit };
}

function evalFraction(value: string): number {
  const [num, den] = value.split("/").map(Number);
  if (!den) return num;
  return num / den;
}

function extractDescription(text: string): string {
  const match = text.match(/(?:pos )?description\s*:\s*([^\n]+)/i);
  return match?.[1]?.trim() ?? "";
}

function extractVisualBrief(text: string): string {
  const match = text.match(/visual brief\s*:\s*([^\n]+(?:\n(?!\n|#|\*\*)[^\n]+)*)/i);
  return match?.[1]?.trim() ?? "";
}

function extractInstructions(text: string): string[] {
  const block = text.match(
    /(?:prep steps?|instructions?|recipe)\s*:?\s*\n([\s\S]+?)(?:\n\n(?:#{1,3}|visual|suggested|\*\*)|\Z)/i
  );
  const source = block?.[1] ?? text;
  const steps: string[] = [];
  for (const line of source.split("\n")) {
    const step = line.replace(/^\s*\d+[\).\]:]\s*/, "").trim();
    if (step.length > 8) steps.push(step);
  }
  return steps;
}

function extractIngredients(text: string): Array<{ name: string; qty: number; unit: string }> {
  const ingredients: Array<{ name: string; qty: number; unit: string }> = [];
  const seen = new Set<string>();

  const block = text.match(
    /ingredients?\s*:?\s*\n([\s\S]*?)(?:\n\n|prep steps?|instructions?|visual brief|suggested add-?on|#{1,3}|\Z)/i
  );
  const lines = block?.[1]?.split("\n") ?? text.split("\n");

  for (const line of lines) {
    const bullet = line.match(/^\s*[-•*]\s+(.+)$/);
    if (!bullet) continue;
    const parsed = parseIngredientLine(bullet[1]);
    if (!parsed) continue;
    const key = ingredientKey(parsed.name);
    if (seen.has(key)) continue;
    seen.add(key);
    ingredients.push(parsed);
  }

  return ingredients;
}

/** Build a ready-to-finalize plan from Creative's recipe draft in chat history. */
export function inferRecipeBuildPlanFromThread(
  messages: Array<{ role: string; content: string }>,
  catalogDraft?: ChatCatalogDraftPayload | null
): RecipeBuildPlanPayload | null {
  if (!threadHasRecipeDraft(messages)) return null;

  const assistantText = creativeRecipeDraftText(messages);
  if (!assistantText.trim()) return null;

  const catalogName =
    catalogDraft?.source === "pricing" ? "" : catalogDraft?.name?.trim() || "";

  const dishName =
    catalogName ||
    inferRecipeDraftDishName(messages) ||
    cleanMenuDishName(
      assistantText.match(/(?:^|\n)#{1,3}\s*([^\n#*]+)\n/)?.[1]?.trim() || ""
    ) ||
    "";

  if (!dishName) return null;

  const ingredients = extractIngredients(assistantText);
  const instructions = extractInstructions(assistantText);
  if (!ingredients.length) return null;

  return {
    dishName: dishName
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" "),
    description: extractDescription(assistantText) || catalogDraft?.description,
    visualBrief: extractVisualBrief(assistantText),
    classification: catalogDraft?.classification ?? "juice",
    instructions,
    ingredients: ingredients.map((row) => ({
      key: ingredientKey(row.name),
      name: row.name,
      qtyPerServing: row.qty,
      unit: row.unit,
    })),
    status: "ready_to_finalize",
  };
}
