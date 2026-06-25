import { isIngredientRequired } from "@backend/services/catalog/ingredient-pantry-status";
import {
  computeFinanceSummary,
  financePeriodRange,
  isIngredientExpiring,
  type DashboardFinancePeriod,
} from "@backend/services/dashboard/dashboard-stats";
import type { DashboardChatContext } from "@backend/services/agents/dashboard-chat";
import {
  CHAT_ASSISTANT_NAMES,
  CHAT_ASSISTANT_PROFILES,
} from "@backend/services/agents/dashboard-chat";
import { Ingredient } from "@backend/models/Ingredient";
import { Dish } from "@backend/models/Dish";
import { Recipe } from "@backend/models/Recipe";
import { SalesOrder } from "@backend/models/SalesOrder";
import { PurchaseOrder } from "@backend/models/PurchaseOrder";

export async function buildHeadChatContext(
  restaurantId: string,
  financePeriod: DashboardFinancePeriod = "week"
): Promise<string> {
  const [inventory, business] = await Promise.all([
    buildInventoryChatContext(restaurantId),
    buildBusinessChatContext(restaurantId, financePeriod),
  ]);

  return [`Inventory snapshot:\n${inventory}`, `Business snapshot:\n${business}`].join("\n\n");
}

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
  financePeriod: DashboardFinancePeriod = "week"
): Promise<string> {
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
    financePeriod
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

  const periodLabel = financePeriodRange(financePeriod).label;

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

export async function buildCreativeChatContext(
  restaurantId: string,
  cuesText: string
): Promise<string> {
  const [ingredients, dishes, recipes] = await Promise.all([
    Ingredient.find({ restaurantId })
      .select("slug name category currentQty inventoryUnit expiryDate")
      .lean(),
    Dish.find({ restaurantId })
      .select("slug name classification recipeStatus sellPrice")
      .lean(),
    Recipe.find({ restaurantId, progress: "ready", kind: "dish" }).lean(),
  ]);

  const expiring = ingredients.filter((ing) => isIngredientExpiring(ing));
  const expiringLines =
    expiring
      .map((ing) => `${ing.name} (${ing.slug}) — ${ing.currentQty} ${ing.inventoryUnit}`)
      .join("\n") || "None";

  const topMarginRecipes = recipes
    .filter((recipe) => recipe.foodCost > 0 && recipe.sellPrice > 0)
    .map((recipe) => ({
      marginPct: ((recipe.sellPrice - recipe.foodCost) / recipe.sellPrice) * 100,
      ingredients: recipe.ingredients,
    }))
    .sort((a, b) => b.marginPct - a.marginPct)
    .slice(0, 5);

  const highMarginIngredientNames = new Set<string>();
  for (const recipe of topMarginRecipes) {
    for (const ing of recipe.ingredients) {
      if (highMarginIngredientNames.size >= 12) break;
      highMarginIngredientNames.add(`${ing.ingredientName} (${ing.ingredientSlug})`);
    }
  }

  const pantry = ingredients
    .slice(0, 40)
    .map(
      (ing) =>
        `${ing.name} (${ing.slug}, ${ing.category}, ${ing.currentQty} ${ing.inventoryUnit})`
    )
    .join("\n");

  const active = dishes
    .filter((d) => (d.recipeStatus ?? "new") === "active")
    .map((d) => `${d.name} — $${d.sellPrice.toFixed(2)}`)
    .join("\n");

  const suggested = dishes
    .filter((d) => d.recipeStatus === "suggested")
    .map((d) => d.name)
    .join(", ");

  return [
    `Context cues:\n${cuesText}`,
    `\nExpiring within 7 days:\n${expiringLines}`,
    `\nHigh-margin ingredients (from top dishes):\n${
      highMarginIngredientNames.size
        ? Array.from(highMarginIngredientNames).join("\n")
        : "No priced recipes yet"
    }`,
    `\nPantry (sample):\n${pantry || "Empty"}`,
    `\nActive menu:\n${active || "None"}`,
    `\nExisting suggestions: ${suggested || "None"}`,
  ].join("\n");
}

function buildDelegationBlock(): string {
  const supervisor = CHAT_ASSISTANT_NAMES.head;
  const inventory = CHAT_ASSISTANT_NAMES.inventory;
  const business = CHAT_ASSISTANT_NAMES.business;
  const creative = CHAT_ASSISTANT_NAMES.create;

  return `**${supervisor}** is the kitchen supervisor chat, plus three specialist agents on the Dashboard. Stay in your role and delegate clearly:

- **${supervisor}** (floating chat dock)
  Role: triage, daily priorities, routing to specialists
  Data: high-level kitchen snapshots

- **${inventory}** (Dashboard → Inventory)
  Role: **all kitchen catalog DB writes** — pantry, dishes, add-ons, recipes, bills

- **${business}** (Dashboard → Business)
  Role: finance reads, promotion & reorder **recommendations** (read-only); Inventory applies writes

- **${creative}** (Dashboard → Create)
  Role: draft recipes, specials, and **suggested add-ons for dishes** (read-only); Inventory saves

When a question is outside your scope, name the correct assistant. Only Inventory mutates catalog data.`;
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

  const base = `You are **${profile.name}**, helping Chef ${chefName} at ${restaurantName}.

Persona: ${profile.persona}

Your role: ${profile.role}

Your data access (use ONLY this — never invent figures): ${profile.dataAccess}

${buildDelegationBlock()}`;

  if (context === "head") {
    return `${base}

You are the supervisor — run golden workflows; consult **${creative}** for recipes and **suggested add-ons**;
**${inventory}** for all writes after confirm; **${business}** for finance reads.
Never claim a catalog mutation completed without specialist tool output.
After each substantive answer, include one concise proactive next-step question.

Kitchen snapshots:
${dataContext}`;
  }

  if (context === "inventory") {
    return `${base}

You OWN **all kitchen catalog DB writes** — ingredients, dishes, add-ons, recipes, links, and images.
Use apply_inventory for pantry, bills (process_purchase_bills, process_sales_bills), and apply_price_change.
Use apply_menu for menu/recipe catalog (create/update/delete, plan_recipe_build → finalize_recipe_build, add_suggested_dish).
Delegate to **${business}** for finance **reads** and margin suggestions (query_business suggest_price_change).
Delegate to **${creative}** for brainstorming only — you persist when the chef confirms.

Live kitchen data:
${dataContext}`;
  }

  if (context === "business") {
    return `${base}

You OWN **promotion and profitability analysis** — margins, slow sellers, price-reset advice, reorder threshold recommendations.
Use query_business: finance_summary, margins, top_selling, slow_sellers, promotion_opportunities, suggest_price_change, suggest_reorder_threshold, sales_queue.
Use query_inventory for pantry context when stock informs reorder advice.
Never call write tools — delegate apply_price_change, update_reorder_threshold, and process_sales_bills to **${inventory}**.
Delegate expiry-driven recipe and special ideas to **${creative}**.

Live business data:
${dataContext}`;
  }

  return `${base}

You OWN **menu ideation and recipe drafting** — cues, seasonal specials, promotional recipes, expiry-driven dishes, full recipes, and **suggested add-ons for dishes**.
Use query_menu: cues, search_dishes, suggested, addons, promotion_targets.
Use query_inventory: expiring, search — ingredient names are general pantry terms (no brands in recipe lists).
Draft ingredients with qty/unit and numbered steps; never ask the chef for amounts you can propose.
On confirm, delegate saves to **${inventory}**: add_suggested_dish (Suggested tab) or plan_recipe_build → finalize_recipe_build (full kitchen build).
Delegate sales-driven promotion analysis to **${business}** when needed.
${extras ?? ""}

Live creative context:
${dataContext}`;
}
