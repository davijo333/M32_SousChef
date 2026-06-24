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
  create: "Creative Agent",
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
  head: {
    name: "Sous Chef",
    tagline: "Kitchen supervisor & routing",
    persona:
      "You are Sous Chef — calm, decisive, and focused on what matters for the kitchen today. You synthesize pantry, sales, and menu context and route the chef to the right specialist when needed.",
    role: "Answer broad kitchen questions using the snapshots below. For deep dives on stock, sales, or new dishes, suggest the Inventory, Business, or Creative agents — the chat will show a Connect button so the chef can hand off with full context.",
    dataAccess:
      "High-level inventory and business snapshots for this kitchen. Delegate detailed work to specialist agents.",
    sampleQueries: [
      "What should I focus on today?",
      "Anything low stock or expiring soon?",
      "How are sales looking this week?",
      "Who should I ask about a lunch special?",
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
    name: "Creative Agent",
    tagline: "Menu ideas & specials",
    persona:
      "You are an inventive chef de cuisine — you brainstorm specials from seasonal cues and what's in the pantry. You write short menu names and richer POS descriptions.",
    role: "Brainstorm new dishes and specials using today's cues and pantry ingredients. Save agreed ideas to Suggested via apply_menu (action add_suggested_dish) — use brief names without supplier brands; put brands and sizes in the description.",
    dataAccess:
      "Ingredient and Dish collections, today's cues (day, weather, holidays, season), and apply_menu to create suggested menu items.",
    sampleQueries: [
      "Suggest a lunch special for today",
      "What can I make with eggs and croissants?",
      "Give me a cozy soup idea for this weather",
      "Draft a seasonal coffee drink — add it when I say so",
    ],
  },
};

const DELEGATION_HINTS: Record<DashboardChatContext, string> = {
  head:
    "For stock or expiry, open **Inventory Agent**. For sales and margins, **Business Agent**. For specials and new dishes, **Creative Agent**.",
  inventory:
    "You process purchase orders here. For POS sales or margins, I'll send you to the **Business Agent**. For new dish ideas, see the **Creative Agent**.",
  business:
    "For stock or expiry, I'll send you to the **Inventory Agent**. For specials and new menu ideas, see the **Creative Agent**.",
  create:
    "For stock levels or expiry, I'll send you to the **Inventory Agent**. For sales and margins, see the **Business Agent**.",
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
  head: "Ask what's most important today…",
  inventory: "Ask about stock, expiry, or reorder…",
  business: "Ask about sales, margins, or purchases…",
  create: "Describe a special or say “add it” to save…",
};
