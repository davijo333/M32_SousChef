import { ingredientUsageCost } from "@backend/services/recipes/recipe-pricing";
import type { IRecipe } from "@backend/models/Recipe";

export const MARGIN_RANKING_LIMIT = 10;

export type MarginDishRow = {
  slug: string;
  name: string;
  sellPrice: number;
  foodCost: number;
  marginDollars: number;
  marginPercent: number;
};

export type MarginIngredientRow = {
  slug: string;
  name: string;
  attributedProfit: number;
  recipeCount: number;
};

type IngredientPriceInput = {
  slug: string;
  name: string;
  lastPurchasePrice?: number;
  usageUnits?: Array<{ unit: string; countPerInventoryUnit: number }>;
};

function dishMarginRow(recipe: IRecipe): MarginDishRow {
  const marginDollars = Math.round((recipe.sellPrice - recipe.foodCost) * 100) / 100;
  const marginPercent =
    recipe.sellPrice > 0
      ? Math.round((marginDollars / recipe.sellPrice) * 1000) / 10
      : 0;
  return {
    slug: recipe.targetSlug,
    name: recipe.dishName,
    sellPrice: recipe.sellPrice,
    foodCost: recipe.foodCost,
    marginDollars,
    marginPercent,
  };
}

export function buildDishMarginRankings(recipes: IRecipe[]): {
  highest: MarginDishRow[];
  lowest: MarginDishRow[];
} {
  const dishRecipes = recipes.filter(
    (recipe) => recipe.kind === "dish" && recipe.progress === "ready" && recipe.foodCost > 0
  );
  const rows = dishRecipes.map(dishMarginRow).sort((a, b) => b.marginDollars - a.marginDollars);

  return {
    highest: rows.slice(0, MARGIN_RANKING_LIMIT),
    lowest: [...rows].reverse().slice(0, MARGIN_RANKING_LIMIT),
  };
}

export function buildIngredientProfitRankings(
  recipes: IRecipe[],
  ingredientsBySlug: Map<string, IngredientPriceInput>
): {
  highest: MarginIngredientRow[];
  lowest: MarginIngredientRow[];
} {
  const profitBySlug = new Map<string, { name: string; profit: number; recipeCount: number }>();

  for (const recipe of recipes) {
    if (recipe.progress !== "ready" || recipe.foodCost <= 0) continue;

    const recipeMargin = recipe.sellPrice - recipe.foodCost;
    if (recipeMargin <= 0) continue;

    for (const line of recipe.ingredients) {
      const ingredient = ingredientsBySlug.get(line.ingredientSlug);
      const lineCost = ingredientUsageCost(
        line.ingredientSlug,
        line.qtyUsed,
        line.unit,
        ingredient
      );
      if (lineCost <= 0) continue;

      const attributed = recipeMargin * (lineCost / recipe.foodCost);
      const existing = profitBySlug.get(line.ingredientSlug);
      if (existing) {
        existing.profit += attributed;
        existing.recipeCount += 1;
      } else {
        profitBySlug.set(line.ingredientSlug, {
          name: line.ingredientName || ingredient?.name || line.ingredientSlug,
          profit: attributed,
          recipeCount: 1,
        });
      }
    }
  }

  const rows: MarginIngredientRow[] = Array.from(profitBySlug.entries())
    .map(([slug, row]) => ({
      slug,
      name: row.name,
      attributedProfit: Math.round(row.profit * 100) / 100,
      recipeCount: row.recipeCount,
    }))
    .sort((a, b) => b.attributedProfit - a.attributedProfit);

  return {
    highest: rows.slice(0, MARGIN_RANKING_LIMIT),
    lowest: [...rows].reverse().slice(0, MARGIN_RANKING_LIMIT),
  };
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
