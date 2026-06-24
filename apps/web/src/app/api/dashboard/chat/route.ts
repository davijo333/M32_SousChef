import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { authOptions } from "@/lib/auth";
import { MAX_CHAT_SESSIONS } from "@/lib/chat-retention";
import { buildCreateCues, formatCuesForPrompt } from "@/lib/create-cues";
import {
  buildBusinessChatContext,
  buildChatSystemPrompt,
  buildInventoryChatContext,
} from "@/lib/dashboard-chat-context";
import {
  CHAT_ASSISTANT_NAMES,
  type DashboardChatContext,
  isDashboardChatContext,
} from "@/lib/dashboard-chat";
import { fetchWeatherCue } from "@/lib/create-weather";
import { createSuggestedDish } from "@/lib/create-suggestion";
import { connectDB } from "@/lib/mongodb";
import { Conversation } from "@/models/Conversation";
import { Dish } from "@/models/Dish";
import { Ingredient } from "@/models/Ingredient";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function pruneOldChatSessions(userId: string, context: DashboardChatContext) {
  const excess = await Conversation.find({ userId, context })
    .sort({ updatedAt: 1 })
    .skip(MAX_CHAT_SESSIONS)
    .select("_id")
    .lean();
  for (const conv of excess) {
    await Conversation.deleteOne({ _id: conv._id });
  }
}

async function buildCreateKitchenContext(restaurantId: string, cuesText: string) {
  const [ingredients, dishes] = await Promise.all([
    Ingredient.find({ restaurantId }).select("slug name category currentQty inventoryUnit").lean(),
    Dish.find({ restaurantId })
      .select("slug name classification recipeStatus sellPrice")
      .lean(),
  ]);

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

  return `Context cues:\n${cuesText}\n\nPantry (sample):\n${pantry || "Empty"}\n\nActive menu:\n${active || "None"}\n\nExisting suggestions: ${suggested || "None"}`;
}

const ADD_SUGGESTION_TOOL = {
  type: "function" as const,
  function: {
    name: "add_suggested_dish",
    description:
      "Save a new dish to the Suggested menu after the chef agrees. Links ingredients from pantry when possible.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Menu-ready dish name" },
        description: { type: "string", description: "POS-style description with brands" },
        classification: {
          type: "string",
          enum: ["sandwich", "byo-sandwich", "coffee", "tea", "juice", "other"],
        },
        ingredientSlugs: {
          type: "array",
          items: { type: "string" },
          description: "Optional pantry slugs e.g. ing-bacon",
        },
      },
      required: ["name", "description", "classification"],
    },
  },
};

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  if (!userId) {
    return NextResponse.json({ error: "No user" }, { status: 400 });
  }

  const contextParam = new URL(req.url).searchParams.get("context") ?? "create";
  const conversationIdParam = new URL(req.url).searchParams.get("conversationId");
  if (!isDashboardChatContext(contextParam)) {
    return NextResponse.json({ error: "Invalid context" }, { status: 400 });
  }

  await connectDB();

  const sessions = await Conversation.find({ userId, context: contextParam })
    .sort({ updatedAt: -1 })
    .limit(MAX_CHAT_SESSIONS)
    .select("title updatedAt")
    .lean();

  let conversation = null;
  if (conversationIdParam) {
    conversation = await Conversation.findOne({
      _id: conversationIdParam,
      userId,
      context: contextParam,
    }).lean();
  } else if (sessions.length > 0) {
    conversation = await Conversation.findById(sessions[0]._id).lean();
  }

  return NextResponse.json({
    context: contextParam,
    conversations: sessions.map((session) => ({
      id: session._id.toString(),
      title: session.title || "New chat",
      updatedAt: session.updatedAt,
    })),
    conversationId: conversation?._id?.toString() ?? null,
    messages: (conversation?.messages ?? [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content })),
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const restaurantId = (session.user as { restaurantId?: string }).restaurantId;
  const userId = session.user.id;
  if (!restaurantId || !userId) {
    return NextResponse.json({ error: "No restaurant or user" }, { status: 400 });
  }

  const body = await req.json();
  const message = String(body.message ?? "").trim();
  const conversationId = body.conversationId as string | undefined;
  const newChat = Boolean(body.newChat);
  const confirmSuggestion = Boolean(body.confirmSuggestion);
  const contextParam = String(body.context ?? "create");
  const financeView = body.financeView === "month" ? "month" : "week";

  if (!isDashboardChatContext(contextParam)) {
    return NextResponse.json({ error: "Invalid context" }, { status: 400 });
  }

  if (!message) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  await connectDB();

  const context = contextParam as DashboardChatContext;

  let conversation = null;
  if (!newChat && conversationId) {
    conversation = await Conversation.findOne({ _id: conversationId, userId, context });
  } else if (!newChat) {
    conversation = await Conversation.findOne({ userId, context }).sort({ updatedAt: -1 });
  }

  if (!conversation) {
    conversation = await Conversation.create({
      restaurantId,
      userId,
      context,
      title: message.slice(0, 48),
      messages: [],
    });
    await pruneOldChatSessions(userId, context);
  }

  const chefName = session.user.name ?? "Chef";
  const restaurantName =
    (session.user as { restaurantName?: string }).restaurantName ?? "your kitchen";

  let cues;
  let dataContext: string;
  let createExtras = "";

  if (context === "inventory") {
    dataContext = await buildInventoryChatContext(restaurantId);
  } else if (context === "business") {
    dataContext = await buildBusinessChatContext(restaurantId, financeView);
  } else {
    const weather = await fetchWeatherCue();
    cues = buildCreateCues(weather);
    const cuesText = formatCuesForPrompt(cues);
    dataContext = await buildCreateKitchenContext(restaurantId, cuesText);
    createExtras = `When the chef clearly wants to save an idea, call add_suggested_dish.
Only call add_suggested_dish when the chef confirms (e.g. "add it", "save that")${
      confirmSuggestion ? " — the chef just confirmed saving." : "."
    }
Never invent pantry items — only reference slugs from the pantry list when specifying ingredientSlugs.`;
  }

  const systemPrompt = buildChatSystemPrompt(
    context,
    chefName,
    restaurantName,
    dataContext,
    createExtras
  );

  const history = conversation.messages.slice(-10).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message },
    ],
    ...(context === "create"
      ? {
          tools: [ADD_SUGGESTION_TOOL],
          tool_choice: confirmSuggestion
            ? { type: "function" as const, function: { name: "add_suggested_dish" } }
            : "auto",
        }
      : {}),
  });

  const choice = completion.choices[0];
  let reply = choice.message.content ?? "";
  let createdSuggestion: { slug: string; name: string } | null = null;

  if (context === "create") {
    const toolCall = choice.message.tool_calls?.[0];
    if (toolCall?.type === "function" && toolCall.function.name === "add_suggested_dish") {
      try {
        const args = JSON.parse(toolCall.function.arguments) as {
          name: string;
          description: string;
          classification: string;
          ingredientSlugs?: string[];
        };
        createdSuggestion = await createSuggestedDish(restaurantId, args);
        reply =
          reply ||
          `Saved **${createdSuggestion.name}** to Suggested. Open Recipes → Suggested to review pricing and promote it when ready.`;
      } catch (err) {
        reply =
          (reply ? `${reply}\n\n` : "") +
          (err instanceof Error ? err.message : "Could not save suggestion.");
      }
    }
  }

  if (!reply) {
    const inventory = CHAT_ASSISTANT_NAMES.inventory;
    const business = CHAT_ASSISTANT_NAMES.business;
    const creative = CHAT_ASSISTANT_NAMES.create;
    reply =
      context === "inventory"
        ? `Ask me about stock, expiry, or reorder. For sales or new dishes, switch to the ${business} or ${creative}.`
        : context === "business"
          ? `Ask me about sales, margins, or purchases. For stock or specials, switch to the ${inventory} or ${creative}.`
          : `Tell me what kind of special you'd like. For stock or sales, use the ${inventory} or ${business}.`;
  }

  conversation.messages.push(
    { role: "user", content: message, createdAt: new Date() },
    { role: "assistant", content: reply, createdAt: new Date() }
  );
  if (conversation.messages.filter((m) => m.role === "user").length === 1) {
    conversation.title = message.slice(0, 48);
  }
  await conversation.save();

  const sessions = await Conversation.find({ userId, context })
    .sort({ updatedAt: -1 })
    .limit(MAX_CHAT_SESSIONS)
    .select("title updatedAt")
    .lean();

  return NextResponse.json({
    reply,
    context,
    conversationId: conversation._id.toString(),
    conversations: sessions.map((session) => ({
      id: session._id.toString(),
      title: session.title || "New chat",
      updatedAt: session.updatedAt,
    })),
    cues,
    createdSuggestion,
  });
}
