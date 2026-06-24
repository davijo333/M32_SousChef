import {
  computeFinanceSummary,
  isIngredientExpiring,
  type DashboardFinanceView,
} from "@/lib/dashboard-stats";
import { isIngredientRequired } from "@/lib/ingredient-pantry-status";
import {
  FINANCE_MONTH_PERIOD_COUNT,
  FINANCE_WEEK_PERIOD_COUNT,
} from "@/lib/seed-order-dates";
import type { DashboardChatContext } from "@/lib/dashboard-chat";
import {
  CHAT_ASSISTANT_NAMES,
  CHAT_ASSISTANT_PROFILES,
} from "@/lib/dashboard-chat";
import { Ingredient } from "@/models/Ingredient";
import { Dish } from "@/models/Dish";
import { Recipe } from "@/models/Recipe";
import { SalesOrder } from "@/models/SalesOrder";
import { PurchaseOrder } from "@/models/PurchaseOrder";

export async function buildInventoryChatContext(restaurantId: string): Promise<string> {
  const ingredients = await Ingredient.find({ restaurantId })
    .select("name slug category currentQty reorderThreshold inventoryUnit expiryDate label")
    .lean();

  const low = ingredients.filter((ing) => isIngredientRequired(ing));
  const expiring = ingredients.filter((ing) => isIngredientExpiring(ing));
  const byCategory = new Map<string, number>();
  for (const ing of ingredients) {
    byCategory.set(ing.category, (byCategory.get(ing.category) ?? 0) + 1);
  }

  const categoryLines = Array.from(byCategory.entries())
    .map(([cat, count]) => `${cat}: ${count}`)
    .join(", ");

  return [
    `Total ingredients: ${ingredients.length}`,
    `Categories: ${categoryLines || "none"}`,
    `Low / required (${low.length}): ${
      low
        .slice(0, 12)
        .map((i) => `${i.name} — ${i.currentQty} ${i.inventoryUnit} (reorder ${i.reorderThreshold})`)
        .join("; ") || "none"
    }`,
    `Expiring within 7 days (${expiring.length}): ${
      expiring
        .map((i) => `${i.name} — ${i.currentQty} ${i.inventoryUnit}`)
        .join("; ") || "none"
    }`,
  ].join("\n");
}

export async function buildBusinessChatContext(
  restaurantId: string,
  financeView: DashboardFinanceView = "week"
): Promise<string> {
  const periodCount =
    financeView === "month" ? FINANCE_MONTH_PERIOD_COUNT : FINANCE_WEEK_PERIOD_COUNT;

  const [salesOrders, purchaseOrders, recipes, dishes] = await Promise.all([
    SalesOrder.find({ restaurantId, status: "processed" })
      .select("saleDate uploadDate items")
      .lean(),
    PurchaseOrder.find({ restaurantId, status: "processed" })
      .select("purchaseDate uploadDate items")
      .lean(),
    Recipe.find({ restaurantId, progress: "ready", kind: "dish" }).lean(),
    Dish.find({ restaurantId }).select("name recipeStatus sellPrice").lean(),
  ]);

  const recipesByKey = new Map(
    recipes.map((r) => [`${r.kind}:${r.targetSlug}`, { foodCost: r.foodCost }])
  );
  const summary = computeFinanceSummary(
    salesOrders,
    purchaseOrders,
    recipesByKey,
    financeView,
    periodCount
  );

  const topMargins = recipes
    .filter((r) => r.foodCost > 0)
    .map((r) => ({
      name: r.dishName,
      margin: r.sellPrice - r.foodCost,
      pct: r.sellPrice > 0 ? ((r.sellPrice - r.foodCost) / r.sellPrice) * 100 : 0,
    }))
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 5)
    .map((r) => `${r.name} $${r.margin.toFixed(2)} (${r.pct.toFixed(0)}%)`)
    .join("; ");

  const periodLabel = financeView === "week" ? "past 5 weeks" : "past 2 months";

  return [
    `Period: ${periodLabel}`,
    `POS sales: $${summary.sales.toFixed(0)} (${summary.posTickets} tickets, ${summary.itemsSold} items)`,
    `COGS (sold): $${summary.soldCogs.toFixed(0)}`,
    `Gross profit: $${summary.grossProfit.toFixed(0)} (${summary.grossMarginPercent.toFixed(1)}%)`,
    `Supplier purchases: $${summary.supplierPurchases.toFixed(0)} (bulk restocks — not same as COGS)`,
    `Active dishes: ${dishes.filter((d) => d.recipeStatus === "active").length}`,
    `Top margins per serving: ${topMargins || "no priced recipes yet"}`,
  ].join("\n");
}

function buildDelegationBlock(): string {
  const inventory = CHAT_ASSISTANT_NAMES.inventory;
  const business = CHAT_ASSISTANT_NAMES.business;
  const creative = CHAT_ASSISTANT_NAMES.create;

  return `Sous Chef has three specialized assistants on the Dashboard. Stay in your role and delegate clearly:

- **${inventory}** (Dashboard → Inventory)
  Role: pantry stock, expiry, reorder, ingredient categories, on-hand quantities
  Data: Ingredient records for this kitchen

- **${business}** (Dashboard → Business)
  Role: POS sales, margins, COGS, gross profit, supplier purchases, top sellers
  Data: SalesOrder, PurchaseOrder, Recipe, Dish for this kitchen

- **${creative}** (Dashboard → Create)
  Role: new menu ideas, specials, saving dishes to Suggested
  Data: Ingredient, Dish, daily cues; can call add_suggested_dish

When a question is outside your scope, name the correct assistant and dashboard section. Never invent data from another assistant's domain.`;
}

export function buildChatSystemPrompt(
  context: DashboardChatContext,
  chefName: string,
  restaurantName: string,
  dataContext: string,
  extras?: string
): string {
  const profile = CHAT_ASSISTANT_PROFILES[context];
  const inventory = CHAT_ASSISTANT_NAMES.inventory;
  const business = CHAT_ASSISTANT_NAMES.business;
  const creative = CHAT_ASSISTANT_NAMES.create;

  const base = `You are the **${profile.name}** for Sous Chef, helping Chef ${chefName} at ${restaurantName}.

Persona: ${profile.persona}

Your role: ${profile.role}

Your data access (use ONLY this — never invent figures): ${profile.dataAccess}

${buildDelegationBlock()}`;

  if (context === "inventory") {
    return `${base}

Delegate to **${business}** for POS sales, margins, COGS, or supplier purchases.
Delegate to **${creative}** for brainstorming new dishes or saving suggestions.

Live inventory data:
${dataContext}`;
  }

  if (context === "business") {
    return `${base}

Delegate to **${inventory}** for individual ingredient stock, expiry, or reorder levels.
Delegate to **${creative}** for new menu ideas or specials.
Always explain that supplier purchases are bulk inventory restocks, not per-ticket food cost.

Live business data:
${dataContext}`;
  }

  return `${base}

Delegate to **${inventory}** for stock, expiry, or what's on hand.
Delegate to **${business}** for sales trends, margins, or profitability.
When the chef confirms saving an idea, use add_suggested_dish.
${extras ?? ""}

Live creative context:
${dataContext}`;
}
