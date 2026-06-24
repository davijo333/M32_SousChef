export type DashboardChatContext = "inventory" | "business" | "create";

export const DASHBOARD_CHAT_CONTEXTS: DashboardChatContext[] = [
  "inventory",
  "business",
  "create",
];

export function isDashboardChatContext(value: string): value is DashboardChatContext {
  return DASHBOARD_CHAT_CONTEXTS.includes(value as DashboardChatContext);
}

export const CHAT_ASSISTANT_NAMES: Record<DashboardChatContext, string> = {
  inventory: "Inventory Assistant",
  business: "Business Assistant",
  create: "Creative Assistant",
};

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
  inventory: {
    name: "Inventory Assistant",
    tagline: "Pantry stock, expiry & reorder",
    persona:
      "You are a meticulous pantry manager — precise about quantities, expiry dates, and reorder thresholds. You speak in clear, actionable terms for line cooks and chefs.",
    role: "Answer questions about on-hand ingredients, low stock, items approaching expiry, reorder levels, and pantry categories.",
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
    name: "Business Assistant",
    tagline: "Sales, margins & purchases",
    persona:
      "You are a sharp restaurant analyst — focused on POS performance, food cost, and profitability. You explain finance plainly and never confuse bulk supplier purchases with per-ticket COGS.",
    role: "Answer questions about POS sales, COGS, gross profit, supplier purchases, dish margins, and menu profitability for the selected period.",
    dataAccess:
      "SalesOrder, PurchaseOrder, Recipe, and Dish collections: ticket totals, items sold, food cost, margins, and active menu pricing for this kitchen.",
    sampleQueries: [
      "How did we do on sales this period?",
      "What's our gross margin on sold items?",
      "Which dishes have the best margins?",
      "How do supplier purchases compare to POS sales?",
    ],
  },
  create: {
    name: "Creative Assistant",
    tagline: "Menu ideas & specials",
    persona:
      "You are an inventive chef de cuisine — you brainstorm specials from seasonal cues and what's in the pantry. You write POS-ready dish names and descriptions.",
    role: "Brainstorm new dishes and specials using today's cues and pantry ingredients. Save agreed ideas to Suggested via add_suggested_dish.",
    dataAccess:
      "Ingredient and Dish collections, today's cues (day, weather, holidays, season), and add_suggested_dish to create suggested menu items.",
    sampleQueries: [
      "Suggest a lunch special for today",
      "What can I make with eggs and croissants?",
      "Give me a cozy soup idea for this weather",
      "Draft a seasonal coffee drink — add it when I say so",
    ],
  },
};

const DELEGATION_HINTS: Record<DashboardChatContext, string> = {
  inventory:
    "For sales or margins, I'll send you to the **Business Assistant**. For new dish ideas, see the **Creative Assistant**.",
  business:
    "For stock or expiry, I'll send you to the **Inventory Assistant**. For specials and new menu ideas, see the **Creative Assistant**.",
  create:
    "For stock levels or expiry, I'll send you to the **Inventory Assistant**. For sales and margins, see the **Business Assistant**.",
};

export function buildAssistantGreeting(
  context: DashboardChatContext,
  chefName = "Chef"
): string {
  const profile = CHAT_ASSISTANT_PROFILES[context];
  const samples = profile.sampleQueries.map((query) => `• ${query}`).join("\n");

  return `Hi ${chefName}, I'm your **${profile.name}**.

${profile.role}

${DELEGATION_HINTS[context]}

**Try asking:**
${samples}`;
}

export const CHAT_PLACEHOLDER: Record<DashboardChatContext, string> = {
  inventory: "Ask about stock, expiry, or reorder…",
  business: "Ask about sales, margins, or purchases…",
  create: "Describe a special or say “add it” to save…",
};
