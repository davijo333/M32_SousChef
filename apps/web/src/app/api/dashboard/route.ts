import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  buildFinanceTimeline,
  computeFinanceSummary,
  countDishStats,
  countIngredientStats,
  isIngredientExpiring,
  type DashboardFinanceView,
} from "@/lib/dashboard-stats";
import {
  buildDishMarginRankings,
} from "@/lib/dashboard-margins";
import {
  buildApproachingExpiry,
  buildApproachingReorder,
  buildSalesClassOptions,
  buildTopSellingDishes,
  buildTopUsedIngredients,
} from "@/lib/dashboard-sales-analytics";
import { ensureRecipesForRestaurant } from "@/lib/recipe-builder";
import {
  FINANCE_MONTH_PERIOD_COUNT,
  FINANCE_WEEK_PERIOD_COUNT,
} from "@/lib/seed-order-dates";
import { connectDB } from "@/lib/mongodb";
import { Dish } from "@/models/Dish";
import { Ingredient } from "@/models/Ingredient";
import { PurchaseOrder } from "@/models/PurchaseOrder";
import { Restaurant } from "@/models/Restaurant";
import { Recipe } from "@/models/Recipe";
import { SalesOrder } from "@/models/SalesOrder";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = (session.user as { restaurantId?: string }).restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "No restaurant" }, { status: 400 });
  }

  const viewParam = new URL(req.url).searchParams.get("financeView");
  const financeView: DashboardFinanceView = viewParam === "month" ? "month" : "week";

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
  const periodCount =
    financeView === "month" ? FINANCE_MONTH_PERIOD_COUNT : FINANCE_WEEK_PERIOD_COUNT;
  const finance = buildFinanceTimeline(salesOrders, purchaseOrders, financeView, periodCount);
  const recipesByKey = new Map(
    recipes.map((recipe) => [`${recipe.kind}:${recipe.targetSlug}`, { foodCost: recipe.foodCost }])
  );
  const financeSummary = computeFinanceSummary(
    salesOrders,
    purchaseOrders,
    recipesByKey,
    financeView,
    periodCount
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
    topSellingDishes: buildTopSellingDishes(salesOrders, dishes, financeView, periodCount),
    topUsedIngredients: buildTopUsedIngredients(
      salesOrders,
      dishes,
      recipes,
      ingredients,
      financeView,
      periodCount
    ),
    approachingExpiry: buildApproachingExpiry(ingredients),
    approachingReorder: buildApproachingReorder(ingredients),
  };

  return NextResponse.json({
    restaurant: restaurant
      ? { name: restaurant.name, isSeeded: Boolean(restaurant.isSeeded) }
      : { name: "Your kitchen", isSeeded: false },
    dishes: dishStats,
    ingredients: ingredientStats,
    finance: {
      view: financeView,
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
