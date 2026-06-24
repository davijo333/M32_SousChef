import { dishSlugFromName } from "@/lib/dish-catalog";
import { scheduleRecipeBuild } from "@/lib/recipe-builder";
import { normalizeSuggestionNotes, type SuggestionNote } from "@/lib/suggestion-notes";
import { normalizeDishClassification } from "@/lib/catalog-classification";
import { formatSuggestedMenuName } from "@/lib/suggested-menu-name";
import { Dish } from "@/models/Dish";
import { Ingredient } from "@/models/Ingredient";

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";

export type SuggestedDishInput = {
  name: string;
  description: string;
  classification: string;
  ingredientSlugs?: string[];
  notes?: SuggestionNote[];
};

async function uniqueDishSlug(restaurantId: string, baseName: string): Promise<string> {
  let slug = dishSlugFromName(baseName);
  let suffix = 2;
  while (await Dish.findOne({ restaurantId, slug })) {
    slug = `${dishSlugFromName(baseName)}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

async function linkViaAgent(
  restaurantId: string,
  slug: string,
  name: string,
  classification: string
): Promise<
  Array<{ ingredientSlug: string; qtyPerServing: number; unit: string; scalesWithSize: boolean }>
> {
  const ingredients = await Ingredient.find({ restaurantId }).lean();
  const payload = ingredients.map((ing) => ({
    slug: ing.slug,
    name: ing.name,
    inventoryUnit: ing.inventoryUnit,
    usageUnits: ing.usageUnits ?? [],
  }));

  try {
    const res = await fetch(`${AGENT_URL}/link-recipe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        menu_item: {
          slug,
          name,
          type: "standard",
          category: classification,
        },
        ingredients: payload,
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      links?: Array<{
        ingredientSlug: string;
        qtyPerServing: number;
        unit: string;
        confidence?: number;
      }>;
    };
    return (data.links ?? [])
      .filter((link) => link.confidence == null || link.confidence >= 0.35)
      .map((link) => ({
        ingredientSlug: link.ingredientSlug,
        qtyPerServing: link.qtyPerServing,
        unit: link.unit,
        scalesWithSize: false,
      }));
  } catch {
    return [];
  }
}

export async function createSuggestedDish(
  restaurantId: string,
  input: SuggestedDishInput
): Promise<{ slug: string; name: string }> {
  const classification = normalizeDishClassification(input.classification) || "other";
  const menuName = formatSuggestedMenuName(input.name);
  const slug = await uniqueDishSlug(restaurantId, menuName);

  let ingredientLinks =
    input.ingredientSlugs?.map((ingredientSlug) => ({
      ingredientSlug,
      qtyPerServing: 1,
      unit: "each",
      scalesWithSize: false,
    })) ?? [];

  if (!ingredientLinks.length) {
    ingredientLinks = await linkViaAgent(restaurantId, slug, menuName, classification);
  }

  const suggestionNotes = normalizeSuggestionNotes(input.notes);
  if (!suggestionNotes.length) {
    throw new Error(
      "Creative Assistant must include at least one suggestion note (e.g. expiring ingredients, seasonal offer, high-margin pantry items)."
    );
  }

  await Dish.create({
    restaurantId,
    slug,
    name: menuName,
    description: input.description.trim(),
    classification,
    category: classification,
    sellPrice: 0,
    ingredientLinks,
    recipeStatus: "suggested",
    source: "agent_create",
    imageGenerationAttempted: false,
    suggestionNotes,
  });

  if (ingredientLinks.length) {
    scheduleRecipeBuild(restaurantId, "dish", slug);
  }

  return { slug, name: menuName };
}
