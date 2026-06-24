import mongoose from "mongoose";
import {
  computeRecipeFoodCost,
  computeSellPriceFromCost,
  DEFAULT_RECIPE_MARGIN,
} from "@/lib/recipe-pricing";
import { beginRecipeAgentWork, endRecipeAgentWork } from "@/lib/recipe-agent-status";
import { AddOn } from "@/models/AddOn";
import { Dish, type IIngredientLink } from "@/models/Dish";
import { Ingredient } from "@/models/Ingredient";
import { Recipe, type RecipeKind, type RecipeProgress } from "@/models/Recipe";

async function nextRecipeNumber(restaurantId: string): Promise<number> {
  const last = await Recipe.findOne({ restaurantId })
    .sort({ recipeNumber: -1 })
    .select("recipeNumber")
    .lean();
  return (last?.recipeNumber ?? 0) + 1;
}

async function setRecipeProgress(
  restaurantId: string,
  kind: RecipeKind,
  targetSlug: string,
  progress: RecipeProgress,
  message?: string
) {
  await Recipe.updateOne(
    { restaurantId, kind, targetSlug },
    { $set: { progress, progressMessage: message } }
  );
}

function buildIngredientRows(
  links: IIngredientLink[],
  namesBySlug: Map<string, string>
): Array<{ ingredientSlug: string; ingredientName: string; qtyUsed: number; unit: string }> {
  return links.map((link) => ({
    ingredientSlug: link.ingredientSlug,
    ingredientName: namesBySlug.get(link.ingredientSlug) ?? link.ingredientSlug,
    qtyUsed: link.qtyPerServing,
    unit: link.unit,
  }));
}

export async function buildRecipeForTarget(
  restaurantId: string,
  kind: RecipeKind,
  targetSlug: string,
  options: { initialProgress?: RecipeProgress; skipSellPriceUpdate?: boolean } = {}
): Promise<void> {
  const initialProgress = options.initialProgress ?? "pricing";

  const [dish, addOn, ingredients] = await Promise.all([
    kind === "dish" ? Dish.findOne({ restaurantId, slug: targetSlug }) : null,
    kind === "addon" ? AddOn.findOne({ restaurantId, slug: targetSlug }) : null,
    Ingredient.find({ restaurantId }).lean(),
  ]);

  const item = kind === "dish" ? dish : addOn;
  if (!item) return;

  const links = item.ingredientLinks ?? [];
  if (!links.length) {
    await Recipe.deleteOne({ restaurantId, kind, targetSlug });
    return;
  }

  const namesBySlug = new Map(ingredients.map((i) => [i.slug, i.name]));
  const priceBySlug = new Map(
    ingredients.map((i) => [
      i.slug,
      { slug: i.slug, lastPurchasePrice: i.lastPurchasePrice, usageUnits: i.usageUnits },
    ])
  );

  let recipe = await Recipe.findOne({ restaurantId, kind, targetSlug });
  if (!recipe) {
    recipe = await Recipe.create({
      restaurantId,
      recipeNumber: await nextRecipeNumber(restaurantId),
      kind,
      targetSlug,
      dishName: item.name,
      servingQty: 1,
      ingredients: [],
      foodCost: 0,
      margin: DEFAULT_RECIPE_MARGIN,
      sellPrice: item.sellPrice ?? 0,
      progress: initialProgress,
      recipeStatus: item.recipeStatus ?? "new",
    });
  } else {
    recipe.dishName = item.name;
    recipe.progress = initialProgress;
    recipe.recipeStatus = item.recipeStatus ?? recipe.recipeStatus ?? "new";
    await recipe.save();
  }

  await setRecipeProgress(restaurantId, kind, targetSlug, "pricing", "Computing food cost…");

  const foodCost = computeRecipeFoodCost(links, priceBySlug);
  const classification =
    kind === "dish"
      ? (dish?.classification ?? dish?.category)
      : (addOn?.classification ?? "addon");
  const sellPrice = computeSellPriceFromCost(foodCost, {
    classification,
    isAddon: kind === "addon",
    margin: DEFAULT_RECIPE_MARGIN,
  });

  const ingredientRows = buildIngredientRows(links, namesBySlug);

  await Recipe.updateOne(
    { _id: recipe._id },
    {
      $set: {
        dishName: item.name,
        servingQty: 1,
        ingredients: ingredientRows,
        foodCost,
        margin: DEFAULT_RECIPE_MARGIN,
        sellPrice,
        progress: "ready",
        progressMessage: undefined,
        recipeStatus: item.recipeStatus ?? "new",
      },
    }
  );

  if (!options.skipSellPriceUpdate) {
    if (kind === "dish" && dish) {
      dish.sellPrice = sellPrice;
      if (!dish.recipeStatus && links.length) dish.recipeStatus = "new";
      await dish.save();
    } else if (kind === "addon" && addOn) {
      addOn.sellPrice = sellPrice;
      if (!addOn.recipeStatus && links.length) addOn.recipeStatus = "new";
      await addOn.save();
    }
  }
}

export async function buildAllRecipesForRestaurant(restaurantId: string): Promise<number> {
  const [dishes, addOns] = await Promise.all([
    Dish.find({ restaurantId }).select("slug ingredientLinks").lean(),
    AddOn.find({ restaurantId }).select("slug ingredientLinks").lean(),
  ]);

  let built = 0;
  for (const dish of dishes) {
    if (!dish.ingredientLinks?.length) continue;
    await buildRecipeForTarget(restaurantId, "dish", dish.slug);
    built += 1;
  }
  for (const addOn of addOns) {
    if (!addOn.ingredientLinks?.length) continue;
    await buildRecipeForTarget(restaurantId, "addon", addOn.slug);
    built += 1;
  }
  return built;
}

/** Build missing priced recipes when dishes/add-ons have links but Recipe rows are absent or not ready. */
export async function ensureRecipesForRestaurant(restaurantId: string): Promise<number> {
  const [dishesWithLinks, addOnsWithLinks, readyRecipes] = await Promise.all([
    Dish.countDocuments({ restaurantId, "ingredientLinks.0": { $exists: true } }),
    AddOn.countDocuments({ restaurantId, "ingredientLinks.0": { $exists: true } }),
    Recipe.countDocuments({ restaurantId, progress: "ready", foodCost: { $gt: 0 } }),
  ]);

  const expected = dishesWithLinks + addOnsWithLinks;
  if (expected === 0 || readyRecipes >= expected) {
    return readyRecipes;
  }

  return buildAllRecipesForRestaurant(restaurantId);
}

/** Fire-and-forget recipe build after manual ingredient linking. */
export function scheduleRecipeBuild(
  restaurantId: string,
  kind: RecipeKind,
  targetSlug: string
): void {
  void (async () => {
    await beginRecipeAgentWork(restaurantId);
    try {
      await buildRecipeForTarget(restaurantId, kind, targetSlug, {
        initialProgress: "pricing",
      });
    } catch (err) {
      await Recipe.updateOne(
        { restaurantId: new mongoose.Types.ObjectId(restaurantId), kind, targetSlug },
        {
          $set: {
            progress: "failed",
            progressMessage: err instanceof Error ? err.message : "Recipe build failed",
          },
        }
      );
    } finally {
      await endRecipeAgentWork(restaurantId);
    }
  })();
}
