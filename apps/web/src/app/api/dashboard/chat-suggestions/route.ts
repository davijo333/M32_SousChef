import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@backend/services/infra/auth";
import { connectDB } from "@backend/services/infra/mongodb";
import { Ingredient } from "@backend/models/Ingredient";
import { Dish } from "@backend/models/Dish";
import { SalesOrder } from "@backend/models/SalesOrder";
import {
  CHAT_ASSISTANT_PROFILES,
  isDashboardChatContext,
  type DashboardChatContext,
} from "@backend/services/agents/dashboard-chat";

export const dynamic = "force-dynamic";

type KitchenStats = { ingredientCount: number; dishCount: number; salesCount: number };

function sampleQueriesFor(
  page: DashboardChatContext,
  agent: DashboardChatContext,
  stats: KitchenStats
): string[] {
  const { ingredientCount, dishCount, salesCount } = stats;
  const emptyKitchen = ingredientCount === 0 && dishCount === 0;
  const profile = CHAT_ASSISTANT_PROFILES[agent];
  const fallback = profile.sampleQueries;

  if (emptyKitchen) {
    if (page === "inventory" && agent === "inventory") {
      return [
        "What should I add to an empty pantry first?",
        "Set reorder levels for basic ingredients.",
        "How do I process a supplier purchase order?",
        "Upload a bill and add items to stock.",
      ];
    }
    if (page === "business" && agent === "business") {
      return [
        "How should I price my first dishes?",
        "What margin should I target on beverages?",
        "How will sales receipts work here?",
        "Explain food cost vs supplier purchases.",
      ];
    }
    if (page === "create" && agent === "create") {
      return [
        "Create a new dish from a photo.",
        "Draft a Mango Smoothie with ingredients and recipe.",
        "Suggest a simple starter menu.",
        "What makes a good POS dish description?",
      ];
    }
    if (page === "head" && agent === "head") {
      return [
        "Help me set up a new kitchen from scratch.",
        "Upload a dish photo and identify it.",
        "Create a new dish with ingredients and images.",
        "What should I focus on first today?",
      ];
    }
    if (agent === "inventory") {
      return [
        "Add starter pantry ingredients.",
        "What reorder levels should I set?",
        "Process uploaded purchase orders.",
        ...fallback.slice(0, 1),
      ];
    }
    if (agent === "business") {
      return [
        "How should I price my first menu?",
        "What margin should I aim for?",
        ...fallback.slice(0, 2),
      ];
    }
    if (agent === "create") {
      return [
        "Create a new dish from a photo.",
        "Build a smoothie with full recipe.",
        ...fallback.slice(0, 2),
      ];
    }
    return [
      "Help me set up my kitchen.",
      "Create a new dish from a photo.",
      "What should I focus on first?",
      ...fallback.slice(0, 1),
    ];
  }

  if (agent === "inventory") {
    if (page === "inventory") {
      return [
        "What's low stock right now?",
        "Which ingredients expire this week?",
        "Process my uploaded purchase orders.",
        "What should I reorder first?",
      ];
    }
    return [
      "What's low stock right now?",
      "Which items expire in the next 7 days?",
      "Check pantry before I create a new dish.",
      "Suggest reorder levels for key items.",
    ];
  }

  if (agent === "business") {
    if (page === "business") {
      return [
        salesCount > 0 ? "How are sales looking this week?" : "How should I price my dishes?",
        "Which dishes have the best margins?",
        "Review supplier purchases vs POS sales.",
        "Suggest a price change for a top seller.",
      ];
    }
    return [
      salesCount > 0 ? "How are sales looking this week?" : "How should I price my first dishes?",
      "Which menu items need a margin review?",
      "What's our gross margin this period?",
      "Compare purchases to ticket revenue.",
    ];
  }

  if (agent === "create") {
    if (page === "create") {
      return [
        "Create a new dish from a photo.",
        "Build a full recipe with pantry ingredients.",
        "Suggest a special from expiring stock.",
        "Draft a seasonal beverage for the menu.",
      ];
    }
    return [
      "Suggest a special based on pantry stock.",
      "Create a new dish with ingredients and recipe.",
      "What can I make from current inventory?",
      "Upload a dish picture and identify it.",
    ];
  }

  // Sous Chef
  if (page === "head") {
    return [
      "What should I focus on today?",
      dishCount > 0 ? "How are sales looking this week?" : "Help me add my first menu dish.",
      ingredientCount > 0 ? "Anything low stock or expiring soon?" : "Add starter pantry items.",
      "Create a new dish from a photo.",
    ];
  }
  if (page === "inventory") {
    return [
      "Summarize pantry status for me.",
      "Anything I should reorder before service?",
      "Help me process uploaded bills.",
      "Who should I ask about menu ideas?",
    ];
  }
  if (page === "business") {
    return [
      "How did we do on sales this period?",
      "Which dishes need a pricing review?",
      "Summarize margins for active menu items.",
      "What should I check in inventory next?",
    ];
  }
  return [
    "Help me add a new dish to the menu.",
    "Check inventory for today's specials.",
    "What should I focus on in the kitchen?",
    "Review how my menu is shaping up.",
  ];
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = (session.user as { restaurantId?: string }).restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "No restaurant" }, { status: 400 });
  }

  const url = new URL(req.url);
  const pageParam = url.searchParams.get("page") ?? url.searchParams.get("context") ?? "head";
  const agentParam = url.searchParams.get("agent") ?? pageParam;

  const page: DashboardChatContext = isDashboardChatContext(pageParam) ? pageParam : "head";
  const agent: DashboardChatContext = isDashboardChatContext(agentParam) ? agentParam : page;

  await connectDB();

  const [ingredientCount, dishCount, salesCount] = await Promise.all([
    Ingredient.countDocuments({ restaurantId }),
    Dish.countDocuments({ restaurantId }),
    SalesOrder.countDocuments({ restaurantId, status: "processed" }),
  ]);

  const stats = { ingredientCount, dishCount, salesCount };
  const sampleQueries = sampleQueriesFor(page, agent, stats);

  return NextResponse.json({
    page,
    agent,
    stats,
    sampleQueries,
    /** @deprecated use sampleQueries */
    tryAsking: sampleQueries,
  });
}
