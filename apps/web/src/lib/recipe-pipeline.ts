import mongoose from "mongoose";
import { buildRecipeForTarget } from "@/lib/recipe-builder";
import { refreshIngredientLabels } from "@/lib/ingredient-labels";
import { beginRecipeAgentWork, endRecipeAgentWork } from "@/lib/recipe-agent-status";
import { AddOn } from "@/models/AddOn";
import { Dish } from "@/models/Dish";
import { Ingredient } from "@/models/Ingredient";
import { Recipe } from "@/models/Recipe";

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";

type AgentLink = {
  ingredientSlug: string;
  qtyPerServing: number;
  unit: string;
  scalesWithSize?: boolean;
  confidence?: number;
  notes?: string;
};

type LinkResponse = {
  links: AgentLink[];
  warnings?: string[];
  missingIngredientSlugs?: string[];
};

export type RecipePipelineResult = {
  dishesLinked: number;
  addOnsLinked: number;
  recipesBuilt: number;
  labels: { used: number; unused: number; missing: number };
  warnings: string[];
};

async function linkOneItem(
  item: { slug: string; name: string; type: string; category?: string },
  ingredientPayload: Array<{
    slug: string;
    name: string;
    inventoryUnit: string;
    usageUnits: Array<{ unit: string; countPerInventoryUnit: number }>;
  }>
): Promise<LinkResponse | null> {
  try {
    const res = await fetch(`${AGENT_URL}/link-recipe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        menu_item: {
          slug: item.slug,
          name: item.name,
          type: item.type,
          category: item.category ?? "other",
        },
        ingredients: ingredientPayload,
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as LinkResponse;
  } catch {
    return null;
  }
}

async function markLinking(
  restaurantId: string,
  kind: "dish" | "addon",
  slug: string,
  name: string
) {
  const existing = await Recipe.findOne({ restaurantId, kind, targetSlug: slug });
  if (existing) {
    existing.progress = "linking";
    existing.progressMessage = "Recipe Agent is linking ingredients…";
    existing.dishName = name;
    await existing.save();
    return;
  }
  const last = await Recipe.findOne({ restaurantId }).sort({ recipeNumber: -1 }).select("recipeNumber").lean();
  await Recipe.create({
    restaurantId: new mongoose.Types.ObjectId(restaurantId),
    recipeNumber: (last?.recipeNumber ?? 0) + 1,
    kind,
    targetSlug: slug,
    dishName: name,
    servingQty: 1,
    ingredients: [],
    foodCost: 0,
    margin: 3,
    sellPrice: 0,
    progress: "linking",
    progressMessage: "Recipe Agent is linking ingredients…",
    recipeStatus: "new",
  });
}

/** Run recipe researcher + IM-Agent for dishes/add-ons, then price recipes. */
export async function runRecipePipeline(restaurantId: string): Promise<RecipePipelineResult> {
  await beginRecipeAgentWork(restaurantId);
  try {
    return await runRecipePipelineInner(restaurantId);
  } finally {
    await endRecipeAgentWork(restaurantId);
  }
}

async function runRecipePipelineInner(restaurantId: string): Promise<RecipePipelineResult> {
  const [ingredients, dishes, addOns, existingRecipes] = await Promise.all([
    Ingredient.find({ restaurantId }).lean(),
    Dish.find({ restaurantId }).lean(),
    AddOn.find({ restaurantId }).lean(),
    Recipe.find({ restaurantId }).select("kind targetSlug").lean(),
  ]);

  const recipeKeys = new Set(existingRecipes.map((r) => `${r.kind}:${r.targetSlug}`));

  const ingredientPayload = ingredients.map((i) => ({
    slug: i.slug,
    name: i.name,
    inventoryUnit: i.inventoryUnit,
    usageUnits: i.usageUnits ?? [],
  }));

  const warnings: string[] = [];
  const allMissingSlugs: string[] = [];
  let dishesLinked = 0;
  let addOnsLinked = 0;
  let recipesBuilt = 0;

  for (const dish of dishes) {
    if (!dish.ingredientLinks?.length) {
      await markLinking(restaurantId, "dish", dish.slug, dish.name);
      const data = await linkOneItem(
        { slug: dish.slug, name: dish.name, type: "standard", category: dish.category },
        ingredientPayload
      );
      if (!data) {
        warnings.push(`Could not link recipe for ${dish.name}`);
        await Recipe.updateOne(
          { restaurantId, kind: "dish", targetSlug: dish.slug },
          { $set: { progress: "failed", progressMessage: "Agent could not link ingredients" } }
        );
        continue;
      }
      const links = (data.links ?? []).filter((l) => l.confidence == null || l.confidence >= 0.35);
      if (data.warnings?.length) warnings.push(...data.warnings);
      if (data.missingIngredientSlugs?.length) {
        allMissingSlugs.push(...data.missingIngredientSlugs);
      }
      if (links.length) {
        await Dish.updateOne(
          { _id: dish._id },
          {
            $set: {
              ingredientLinks: links.map((l) => ({
                ingredientSlug: l.ingredientSlug,
                qtyPerServing: l.qtyPerServing,
                unit: l.unit,
                scalesWithSize: l.scalesWithSize ?? true,
                notes: l.notes,
              })),
              recipeStatus: "new",
            },
          }
        );
        dishesLinked += 1;
      }
    }

    const fresh = await Dish.findById(dish._id).lean();
    if (fresh?.ingredientLinks?.length) {
      await buildRecipeForTarget(restaurantId, "dish", dish.slug, { initialProgress: "pricing" });
      recipesBuilt += 1;
      recipeKeys.add(`dish:${dish.slug}`);
    }
  }

  for (const addOn of addOns) {
    if (!addOn.ingredientLinks?.length) {
      await markLinking(restaurantId, "addon", addOn.slug, addOn.name);
      const data = await linkOneItem(
        { slug: addOn.slug, name: addOn.name, type: "addon" },
        ingredientPayload
      );
      if (!data) {
        warnings.push(`Could not link recipe for add-on ${addOn.name}`);
        await Recipe.updateOne(
          { restaurantId, kind: "addon", targetSlug: addOn.slug },
          { $set: { progress: "failed", progressMessage: "Agent could not link ingredients" } }
        );
        continue;
      }
      const links = (data.links ?? []).filter((l) => l.confidence == null || l.confidence >= 0.35);
      if (data.warnings?.length) warnings.push(...data.warnings);
      if (data.missingIngredientSlugs?.length) {
        allMissingSlugs.push(...data.missingIngredientSlugs);
      }
      if (links.length) {
        await AddOn.updateOne(
          { _id: addOn._id },
          {
            $set: {
              ingredientLinks: links.map((l) => ({
                ingredientSlug: l.ingredientSlug,
                qtyPerServing: l.qtyPerServing,
                unit: l.unit,
                scalesWithSize: l.scalesWithSize ?? false,
                notes: l.notes,
              })),
              recipeStatus: "new",
            },
          }
        );
        addOnsLinked += 1;
      }
    }

    const fresh = await AddOn.findById(addOn._id).lean();
    if (fresh?.ingredientLinks?.length) {
      await buildRecipeForTarget(restaurantId, "addon", addOn.slug, { initialProgress: "pricing" });
      recipesBuilt += 1;
      recipeKeys.add(`addon:${addOn.slug}`);
    }
  }

  const labels = await refreshIngredientLabels(restaurantId, allMissingSlugs);

  return { dishesLinked, addOnsLinked, recipesBuilt, labels, warnings };
}
