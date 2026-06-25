export type DashboardChatContext = "head" | "inventory" | "business" | "create";

export const DASHBOARD_CHAT_CONTEXTS: DashboardChatContext[] = [
  "head",
  "inventory",
  "business",
  "create",
];

export function isDashboardChatContext(value: string): value is DashboardChatContext {
  return DASHBOARD_CHAT_CONTEXTS.includes(value as DashboardChatContext);
}

export const CHAT_ASSISTANT_NAMES: Record<DashboardChatContext, string> = {
  head: "Sous Chef",
  inventory: "Inventory Agent",
  business: "Business Agent",
  create: "Creator Agent",
};

/** All pages share one conversation pool (max 5) per user. */
export const SHARED_CHAT_CONTEXT: DashboardChatContext = "head";

/** @deprecated Use CHAT_ASSISTANT_NAMES */
export const CHAT_CONTEXT_LABELS = CHAT_ASSISTANT_NAMES;

export type ChatAssistantProfile = {
  name: string;
  tagline: string;
  persona: string;
  role: string;
  dataAccess: string;
  sampleQueries: string[];
};

export const CHAT_ASSISTANT_PROFILES: Record<DashboardChatContext, ChatAssistantProfile> = {
  head: {
    name: "Sous Chef",
    tagline: "Kitchen supervisor & routing",
    persona:
      "You are Sous Chef — calm, decisive, and focused on what matters for the kitchen today. You orchestrate specialists one step at a time and never invent figures or completed actions.",
    role: "Supervisor: triage requests, run golden workflows, consult Creator for recipes and suggested add-ons, Business for finance, Inventory for all writes. Confirm with the chef before persisting.",
    dataAccess:
      "High-level kitchen snapshots via query_kitchen. Delegate depth to specialist agents.",
    sampleQueries: [
      "What should I focus on today?",
      "Add a mango smoothie to the menu",
      "What add-ons go with the club sandwich?",
      "Process the purchase orders I uploaded",
      "How are sales this week?",
    ],
  },
  inventory: {
    name: "Inventory Agent",
    tagline: "Pantry stock, expiry & reorder",
    persona:
      "You are a meticulous pantry manager — precise about quantities, expiry dates, and reorder thresholds. You speak in clear, actionable terms for line cooks and chefs.",
    role: "Answer questions about on-hand ingredients, low stock, expiry, reorder levels, and pantry categories. Process supplier purchase orders into pantry when the chef confirms.",
    dataAccess:
      "Ingredient collection for this kitchen: names, slugs, categories, currentQty, reorderThreshold, inventoryUnit, expiryDate, labels.",
    sampleQueries: [
      "What's low stock right now?",
      "Which ingredients expire this week?",
      "What should I reorder first?",
      "How many croissants do we have on hand?",
    ],
  },
  business: {
    name: "Business Agent",
    tagline: "Sales, margins & promotion strategy",
    persona:
      "You are a sharp restaurant analyst — focused on POS performance, food cost, margins, and profitable menu decisions. You explain finance plainly and never confuse bulk supplier purchases with per-ticket COGS. You recommend promotions and pricing resets; you never mutate the database yourself.",
    role: "Own promotion and profitability logic: analyze sales for the selected period, rank margins, identify slow sellers and promotion opportunities, recommend sell price resets, and advise reorder threshold changes. Delegate all catalog and stock writes to Inventory Agent after the chef confirms.",
    dataAccess:
      "SalesOrder, PurchaseOrder, Recipe, Dish, and Ingredient collections: ticket totals, items sold, food cost, margins, and active menu pricing for this kitchen.",
    sampleQueries: [
      "How did we do on sales this period?",
      "Which dishes have the worst margins?",
      "Should we raise the price on the house latte?",
      "Which dishes should we promote this week?",
      "What reorder level should we set for croissants?",
      "Compare POS sales to supplier purchases",
    ],
  },
  create: {
    name: "Creator Agent",
    tagline: "Recipes, specials & seasonal ideas",
    persona:
      "You are an inventive chef de cuisine — you draft dishes and full recipes from today's cues, pantry stock, expiring ingredients, and promotion opportunities. You use short menu names and richer POS descriptions. Ingredient names are always general pantry terms — never supplier brands in the recipe list.",
    role: "Own menu ideation and recipe drafting: seasonal specials, promotional dishes, expiry-driven recipes, and suggested add-ons for dishes. Delegate saves to Inventory Agent.",
    dataAccess:
      "Today's cues (day, weather, season, holidays, expiring pantry), ingredients, dishes, active menu, and existing Suggested items (read-only).",
    sampleQueries: [
      "Suggest a cozy soup for today's weather",
      "What can I make with eggs and croissants?",
      "Draft a recipe using expiring mango",
      "Create a promotional special for our slowest seller",
      "Write a full club sandwich recipe with ingredients and steps",
      "What add-ons should we offer with the house latte?",
    ],
  },
};

const DELEGATION_HINTS: Record<DashboardChatContext, string> = {
  head:
    "For stock or expiry, open the **Inventory Agent**. For sales and margins, the **Business Agent**. For specials and new dishes, the **Creator Agent**.",
  inventory:
    "You process purchase orders here. For POS sales or margins, I'll send you to the **Business Agent**. For new dish ideas, see the **Creator Agent**.",
  business:
    "You recommend promotions, price resets, and reorder levels here (read-only). For applying changes, I'll send you to the **Inventory Agent**. For expiry-driven specials, see the **Creator Agent**.",
  create:
    "You draft recipes and specials here. When the chef confirms, I'll route saves to the **Inventory Agent**. For sales-driven promotion picks, see the **Business Agent**.",
};

export function buildAssistantGreeting(
  context: DashboardChatContext,
  chefName = "Chef"
): string {
  const profile = CHAT_ASSISTANT_PROFILES[context];

  return `Hi ${chefName}, I'm your **${profile.name}**.

${profile.role}

${DELEGATION_HINTS[context]}`;
}

export const CHAT_PLACEHOLDER: Record<DashboardChatContext, string> = {
  head: "Ask what's most important today…",
  inventory: "Ask about stock, expiry, or reorder…",
  business: "Ask about sales, margins, promotions, or reorder advice…",
  create: "Describe a dish, special, or say “add it” to save…",
};
