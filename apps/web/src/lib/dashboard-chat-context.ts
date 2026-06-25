import { isIngredientRequired } from "@/lib/ingredient-pantry-status";
import {
  computeFinanceSummary,
  financePeriodRange,
  isIngredientExpiring,
  type DashboardFinancePeriod,
} from "@/lib/dashboard-stats";
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
  Role: pantry stock, expiry, reorder, **process purchase orders into pantry**
  Data: Ingredient records for this kitchen

- **${business}** (Dashboard → Business)
  Role: POS sales, margins, COGS, **process sales receipts** (after POs processed)
  Data: SalesOrder, PurchaseOrder, Recipe, Dish for this kitchen

- **${creative}** (Dashboard → Create)
  Role: new menu ideas, specials, saving dishes to Suggested
  Data: Ingredient, Dish, daily cues; apply_menu(action="add_suggested_dish") with rationale notes

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

  const base = `You are **${profile.name}**, helping Chef ${chefName} at ${restaurantName}.

Persona: ${profile.persona}

Your role: ${profile.role}

Your data access (use ONLY this — never invent figures): ${profile.dataAccess}

${buildDelegationBlock()}`;

  if (context === "head") {
    return `${base}

You are the supervisor — answer from the snapshots when you can. When the chef needs a specialist, name the right agent (**${inventory}**, **${business}**, or **${creative}**) — the app shows a **Connect** button for handoff. Do not tell them to navigate Dashboard tabs manually.

Route to specialists for depth you cannot cover from snapshots alone.

Kitchen snapshots:
${dataContext}`;
  }

  if (context === "inventory") {
    return `${base}

You OWN **supplier purchase order** processing — use apply_inventory action process_purchase_bills when the chef confirms. Never send purchase invoices to Business.
Use apply_inventory for pantry CRUD: create_ingredient, update_ingredient, delete_ingredient, update_reorder_threshold.
Delegate to **${business}** for POS sales analysis, margins, COGS, or **sales receipt** processing.
Delegate to **${creative}** for dishes, ingredient links on menu items, or saving suggestions.

Live inventory data:
${dataContext}`;
  }

  if (context === "business") {
    return `${base}

You OWN **sales receipt** processing — use apply_business action process_sales_bills after purchase orders are processed and the chef confirms.
Delegate to **${inventory}** for purchase order ingest, ingredient stock, expiry, reorder, or pantry CRUD.
Delegate to **${creative}** for new menu ideas, dish CRUD, or linking ingredients to dishes.

Live business data:
${dataContext}`;
  }

  return `${base}

Delegate to **${inventory}** for stock, expiry, or what's on hand.
Delegate to **${business}** for sales trends, margins, or profitability.
Use apply_menu for menu CRUD: create_dish, update_dish, delete_dish, link_dish_ingredients (add/remove/set), add_suggested_dish.
When the chef confirms saving an idea, call apply_menu(action="add_suggested_dish") with at least one note explaining why (expiring ingredients used, seasonal tie-in, high-margin pantry items, today's cue, etc.).
Use a **short menu name** (2–5 words) without pantry supplier brands or pack sizes — e.g. "Pike Place Latte", not "Starbucks Pike Place Coffee 16oz — Land O Lakes Whole Milk". Put brands and ingredient detail in **description** and **notes**.
${extras ?? ""}

Live creative context:
${dataContext}`;
}
