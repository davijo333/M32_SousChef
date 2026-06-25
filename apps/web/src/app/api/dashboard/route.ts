import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@backend/services/infra/auth";
import {
  buildFinanceTimeline,
  computeFinanceSummary,
  countDishStats,
  countIngredientStats,
  isIngredientExpiring,
  parseFinancePeriod,
} from "@backend/services/dashboard/dashboard-stats";
import {
  buildDishMarginRankings,
} from "@backend/services/dashboard/dashboard-margins";
import {
  buildApproachingExpiry,
  buildApproachingReorder,
  buildLeastReorderDiff,
  buildLeastSellingDishes,
  buildSalesClassOptions,
  buildTopSellingDishes,
  buildTopUsedIngredients,
} from "@backend/services/dashboard/dashboard-sales-analytics";
import { ensureRecipesForRestaurant } from "@backend/services/recipes/recipe-builder";
import {
  FINANCE_WEEK_PERIOD_COUNT,
} from "@backend/services/infra/seed-order-dates";
import { connectDB } from "@backend/services/infra/mongodb";
import { Dish } from "@backend/models/Dish";
import { Ingredient } from "@backend/models/Ingredient";
import { PurchaseOrder } from "@backend/models/PurchaseOrder";
import { Restaurant } from "@backend/models/Restaurant";
import { Recipe } from "@backend/models/Recipe";
import { SalesOrder } from "@backend/models/SalesOrder";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = (session.user as { restaurantId?: string }).restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "No restaurant" }, { status: 400 });
  }

  const financePeriod = parseFinancePeriod(new URL(req.url).searchParams.get("financeView"));

  await connectDB();

  await ensureRecipesForRestaurant(restaurantId);

  const [restaurant, ingredients, dishes, salesOrders, purchaseOrders, recipes] = await Promise.all([
    Restaurant.findById(restaurantId).lean(),
    Ingredient.find({ restaurantId }).lean(),
    Dish.find({ restaurantId })
      .select("slug name classification category recipeStatus ingredientLinks")
      .lean(),
    SalesOrder.find({ restaurantId, status: "processed" })
      .select("saleDate uploadDate items")
      .lean(),
    PurchaseOrder.find({ restaurantId, status: "processed" })
      .select("purchaseDate uploadDate items")
      .lean(),
    Recipe.find({ restaurantId }).lean(),
  ]);

  const dishStats = countDishStats(dishes);
  const ingredientStats = countIngredientStats(ingredients);
  const finance = buildFinanceTimeline(salesOrders, purchaseOrders, financePeriod);
  const recipesByKey = new Map(
    recipes.map((recipe) => [`${recipe.kind}:${recipe.targetSlug}`, { foodCost: recipe.foodCost }])
  );
  const financeSummary = computeFinanceSummary(
    salesOrders,
    purchaseOrders,
    recipesByKey,
    financePeriod
  );

  const expiring = ingredients
    .filter((ingredient) => isIngredientExpiring(ingredient))
    .map((ingredient) => ({
      name: ingredient.name,
      currentQty: ingredient.currentQty,
      inventoryUnit: ingredient.inventoryUnit,
      expiryDate: ingredient.expiryDate,
    }))
    .sort(
      (a, b) =>
        new Date(a.expiryDate ?? 0).getTime() - new Date(b.expiryDate ?? 0).getTime()
    );

  const lowStock = ingredients
    .filter((ingredient) => ingredient.currentQty <= ingredient.reorderThreshold)
    .map((ingredient) => ({
      name: ingredient.name,
      currentQty: ingredient.currentQty,
      reorderThreshold: ingredient.reorderThreshold,
      inventoryUnit: ingredient.inventoryUnit,
    }));

  const dishMargins = buildDishMarginRankings(recipes);
  const salesClassOptions = buildSalesClassOptions(dishes, ingredients);
  const salesAnalytics = {
    ...salesClassOptions,
    topSellingDishes: buildTopSellingDishes(
      salesOrders,
      dishes,
      "week",
      FINANCE_WEEK_PERIOD_COUNT
    ),
    leastSellingDishes: buildLeastSellingDishes(
      salesOrders,
      dishes,
      "week",
      FINANCE_WEEK_PERIOD_COUNT
    ),
    topUsedIngredients: buildTopUsedIngredients(
      salesOrders,
      dishes,
      recipes,
      ingredients,
      "week",
      FINANCE_WEEK_PERIOD_COUNT
    ),
    approachingExpiry: buildApproachingExpiry(ingredients),
    approachingReorder: buildApproachingReorder(ingredients),
    leastReorderDiff: buildLeastReorderDiff(ingredients),
  };

  return NextResponse.json({
    restaurant: restaurant
      ? { name: restaurant.name, isSeeded: Boolean(restaurant.isSeeded) }
      : { name: "Your kitchen", isSeeded: false },
    dishes: dishStats,
    ingredients: ingredientStats,
    finance: {
      view: financePeriod,
      periods: finance,
      summary: financeSummary,
    },
    expiring,
    lowStock,
    margins: {
      dishes: dishMargins,
    },
    salesAnalytics,
  });
}
