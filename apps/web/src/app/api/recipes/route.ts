import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@backend/services/infra/auth";
import { connectDB } from "@backend/services/infra/mongodb";
import { ensureRecipesForRestaurant } from "@backend/services/recipes/recipe-builder";
import { isRecipeAgentCooking } from "@backend/services/recipes/recipe-agent-status";
import { AddOn } from "@backend/models/AddOn";
import { Dish } from "@backend/models/Dish";
import { Ingredient } from "@backend/models/Ingredient";
import { Recipe } from "@backend/models/Recipe";

function slugToDisplayName(slug: string): string {
  return slug.replace(/^(dish|addon|ing)-/, "").replace(/-/g, " ");
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = (session.user as { restaurantId?: string }).restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "No restaurant" }, { status: 400 });
  }

  await connectDB();

  await ensureRecipesForRestaurant(restaurantId);

  const [dishes, addOns, ingredients, recipes, recipeAgentCooking] = await Promise.all([
    Dish.find({ restaurantId }).sort({ name: 1 }).lean(),
    AddOn.find({ restaurantId }).sort({ name: 1 }).lean(),
    Ingredient.find({ restaurantId }).select("slug name imageUrl").lean(),
    Recipe.find({ restaurantId }).sort({ recipeNumber: 1 }).lean(),
    isRecipeAgentCooking(restaurantId),
  ]);

  const ingBySlug = new Map(ingredients.map((i) => [i.slug, i]));
  const dishBySlug = new Map(dishes.map((d) => [d.slug, d]));
  const recipeByKey = new Map(recipes.map((r) => [`${r.kind}:${r.targetSlug}`, r]));

  function resolveLinks(links: Array<{
    ingredientSlug: string;
    qtyPerServing: number;
    unit: string;
    scalesWithSize?: boolean;
    notes?: string;
  }>) {
    return (links ?? []).map((link) => {
      const ing = ingBySlug.get(link.ingredientSlug);
      return {
        ingredientSlug: link.ingredientSlug,
        ingredientName: ing?.name ?? slugToDisplayName(link.ingredientSlug),
        imageUrl: ing?.imageUrl,
        qtyPerServing: link.qtyPerServing,
        unit: link.unit,
        scalesWithSize: link.scalesWithSize ?? true,
        notes: link.notes,
        inPantry: Boolean(ing),
      };
    });
  }

  function recipeMeta(kind: "dish" | "addon", slug: string) {
    const recipe = recipeByKey.get(`${kind}:${slug}`);
    if (!recipe) return undefined;
    return {
      recipeNumber: recipe.recipeNumber,
      servingQty: recipe.servingQty,
      foodCost: recipe.foodCost,
      margin: recipe.margin,
      sellPrice: recipe.sellPrice,
      progress: recipe.progress,
      progressMessage: recipe.progressMessage,
      ingredients: recipe.ingredients,
    };
  }

  const inProgress = recipes
    .filter((r) => r.progress === "linking" || r.progress === "pricing")
    .map((r) => ({
      kind: r.kind,
      slug: r.targetSlug,
      name: r.dishName,
      recipeNumber: r.recipeNumber,
      progress: r.progress,
      progressMessage: r.progressMessage,
    }));

  return NextResponse.json({
    recipeAgentCooking,
    inProgress,
    dishes: dishes.map((d) => ({
      slug: d.slug,
      name: d.name,
      category: d.category,
      classification: d.classification ?? d.category,
      sellPrice: d.sellPrice,
      imageUrl: d.imageUrl,
      ingredientLinks: resolveLinks(d.ingredientLinks),
      hasRecipe: (d.ingredientLinks?.length ?? 0) > 0,
      recipeStatus: d.recipeStatus ?? (d.ingredientLinks?.length ? "new" : undefined),
      suggestionNotes: d.suggestionNotes ?? [],
      recipe: recipeMeta("dish", d.slug),
    })),
    addOns: addOns.map((a) => ({
      slug: a.slug,
      name: a.name,
      classification: a.classification ?? "addon",
      sellPrice: a.sellPrice,
      linkedDishSlugs: a.linkedDishSlugs,
      linkedDishNames: a.linkedDishSlugs.map(
        (slug) => dishBySlug.get(slug)?.name ?? slugToDisplayName(slug)
      ),
      ingredientLinks: resolveLinks(a.ingredientLinks),
      hasRecipe: (a.ingredientLinks?.length ?? 0) > 0,
      recipeStatus: a.recipeStatus ?? (a.ingredientLinks?.length ? "new" : undefined),
      recipe: recipeMeta("addon", a.slug),
    })),
    counts: {
      dishes: dishes.length,
      dishesWithRecipes: dishes.filter((d) => d.ingredientLinks?.length).length,
      addOns: addOns.length,
      recipes: recipes.filter((r) => r.progress === "ready").length,
      inProgress: inProgress.length,
      new: dishes.filter((d) => (d.recipeStatus ?? (d.ingredientLinks?.length ? "new" : undefined)) === "new").length
        + addOns.filter((a) => (a.recipeStatus ?? (a.ingredientLinks?.length ? "new" : undefined)) === "new").length,
      active: dishes.filter((d) => d.recipeStatus === "active").length
        + addOns.filter((a) => a.recipeStatus === "active").length,
      inactive: dishes.filter((d) => d.recipeStatus === "inactive").length
        + addOns.filter((a) => a.recipeStatus === "inactive").length,
      suggested: dishes.filter((d) => d.recipeStatus === "suggested").length
        + addOns.filter((a) => a.recipeStatus === "suggested").length,
    },
  });
}
