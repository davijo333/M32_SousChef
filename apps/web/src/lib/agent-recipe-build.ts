import { dishSlugFromName } from "@/lib/dish-catalog";
import { executeInventoryPendingAction } from "@/lib/agent-inventory-actions";
import { normalizeIngredientLinks } from "@/lib/dish-payload";
import { refreshIngredientLabels } from "@/lib/ingredient-labels";
import { regenerateDishImages } from "@/lib/regenerate-dish-images";
import { regenerateIngredientImages } from "@/lib/regenerate-ingredient-images";
import { scheduleRecipeBuild } from "@/lib/recipe-builder";
import { connectDB } from "@/lib/mongodb";
import { Dish } from "@/models/Dish";
import { Ingredient } from "@/models/Ingredient";

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
  options?: RecipeBuildIngredientOption[];
  selectedOption?: RecipeBuildIngredientOption;
};

export type RecipeBuildPlanPayload = {
  dishName: string;
  description?: string;
  classification?: string;
  sellPrice?: number | null;
  ingredients: RecipeBuildIngredientRow[];
  status: "selecting" | "ready_to_finalize";
};

function ingredientSlugFromName(name: string): string {
  return `ing-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

async function ensureIngredient(
  restaurantId: string,
  row: RecipeBuildIngredientRow
): Promise<string> {
  const existingSlug = row.committedSlug || row.pantrySlug;
  if (existingSlug) {
    const ing = await Ingredient.findOne({ restaurantId, slug: existingSlug });
    if (ing && !ing.imageGenerationAttempted) {
      await regenerateIngredientImages(ing, "pair");
    }
    return existingSlug;
  }

  const selected = row.selectedOption;
  const productName = selected?.label?.trim() || row.name;
  const brandName = selected?.brandName?.trim() || undefined;
  const imageUrl = selected?.imageUrl;

  await executeInventoryPendingAction(restaurantId, {
    kind: "create_ingredient",
    ingredientName: productName.includes(row.name) ? productName : row.name,
    brandName,
    imageUrl,
    label: "new",
    inventoryUnit: row.unit || "each",
    currentQty: 0,
    category: "misc",
  });

  let slug = ingredientSlugFromName(row.name);
  let ing = await Ingredient.findOne({ restaurantId, slug });
  if (!ing) {
    ing = await Ingredient.findOne({
      restaurantId,
      name: new RegExp(`^${row.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    });
  }
  if (!ing) {
    throw new Error(`Could not create ingredient for **${row.name}**.`);
  }
  slug = ing.slug;

  if (!imageUrl || (ing.imageCandidates?.length ?? 0) < 2) {
    await regenerateIngredientImages(ing, "pair");
  }

  return slug;
}

export async function executeFinalizeRecipeBuild(
  restaurantId: string,
  plan: RecipeBuildPlanPayload
): Promise<string> {
  await connectDB();

  const dishName = plan.dishName?.trim();
  if (!dishName) throw new Error("Recipe plan missing dish name.");

  const messages: string[] = [];
  const links: Array<{ ingredientSlug: string; qtyPerServing: number; unit: string }> = [];

  for (const row of plan.ingredients ?? []) {
    const slug = await ensureIngredient(restaurantId, row);
    links.push({
      ingredientSlug: slug,
      qtyPerServing: row.qtyPerServing ?? 1,
      unit: row.unit || "each",
    });
    const ing = await Ingredient.findOne({ restaurantId, slug }).select("name").lean();
    messages.push(`Added pantry item **${ing?.name ?? row.name}** (\`${slug}\`, qty 0, label new).`);
  }

  const classification = plan.classification?.trim() || "other";
  const slug = dishSlugFromName(dishName);
  const existing = await Dish.findOne({ restaurantId, slug });
  if (existing) {
    throw new Error(`Dish **${dishName}** already exists — update it in Kitchen control.`);
  }

  const ingredientLinks = normalizeIngredientLinks(
    links.map((link) => ({
      ingredientSlug: link.ingredientSlug,
      qtyPerServing: link.qtyPerServing,
      unit: link.unit,
      scalesWithSize: false,
    }))
  );

  const dish = await Dish.create({
    restaurantId,
    slug,
    name: dishName,
    category: classification,
    classification,
    sellPrice: plan.sellPrice ?? 0,
    description: plan.description?.trim() || undefined,
    ingredientLinks,
    recipeStatus: "new",
    source: "agent_recipe_build",
    imageGenerationAttempted: false,
  });

  await refreshIngredientLabels(restaurantId);
  await regenerateDishImages(dish, "pair");
  if (ingredientLinks.length) scheduleRecipeBuild(restaurantId, "dish", slug);

  messages.push(
    `Created dish **${dishName}** with ${ingredientLinks.length} linked ingredient(s) and generated dish images.`
  );
  messages.push("Open **Kitchen control** to review pantry photos and the menu item.");
  return messages.join("\n");
}
