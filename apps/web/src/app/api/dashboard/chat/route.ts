import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { authOptions } from "@/lib/auth";
import {
  detectHandoffFromConversation,
  isSpecialistHandoffTarget,
  type SpecialistHandoffTarget,
} from "@/lib/chat-handoff";
import { MAX_CHAT_SESSIONS } from "@/lib/chat-retention";
import { buildCreateCues, formatCuesForPrompt } from "@/lib/create-cues";
import {
  buildBusinessChatContext,
  buildChatSystemPrompt,
  buildCreativeChatContext,
  buildHeadChatContext,
  buildInventoryChatContext,
} from "@/lib/dashboard-chat-context";
import {
  CHAT_ASSISTANT_NAMES,
  type DashboardChatContext,
  isDashboardChatContext,
} from "@/lib/dashboard-chat";
import { fetchWeatherCue } from "@/lib/create-weather";
import { createSuggestedDish } from "@/lib/create-suggestion";
import { isIngredientExpiring, parseFinancePeriod } from "@/lib/dashboard-stats";
import { connectDB } from "@/lib/mongodb";
import { SUGGESTION_NOTE_KINDS, normalizeSuggestionNotes } from "@/lib/suggestion-notes";
import { Conversation } from "@/models/Conversation";
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

const ADD_SUGGESTION_TOOL = {
  type: "function" as const,
  function: {
    name: "add_suggested_dish",
    description:
      "Save a new dish to the Suggested menu after the chef agrees. Always include notes explaining why the dish is suggested.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Short customer-facing menu name (2–5 words). No supplier brands, pack sizes, or ingredient SKUs — e.g. 'Pike Place Latte', not 'Starbucks Pike Place Coffee 16oz — Land O Lakes Whole Milk'.",
        },
        description: {
          type: "string",
          description:
            "POS-style description; pantry brands and sizes can go here, not in the name.",
        },
        classification: {
          type: "string",
          enum: ["sandwich", "byo-sandwich", "coffee", "tea", "juice", "other"],
        },
        ingredientSlugs: {
          type: "array",
          items: { type: "string" },
          description: "Optional pantry slugs e.g. ing-bacon",
        },
        notes: {
          type: "array",
          description:
            "Why this dish is suggested — e.g. uses expiring ingredients, seasonal offer, high-margin pantry items, today's cue.",
          items: {
            type: "object",
            properties: {
              kind: {
                type: "string",
                enum: [...SUGGESTION_NOTE_KINDS],
              },
              text: {
                type: "string",
                description: "Short card note, e.g. 'Uses bacon, milk expiring in 3–5 days'",
              },
            },
            required: ["kind", "text"],
          },
        },
      },
      required: ["name", "description", "classification", "notes"],
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
  const agentContextParam = body.agentContext as string | undefined;
  const connectAgentParam = body.connectAgent as string | undefined;
  const financePeriod = parseFinancePeriod(body.financeView);

  if (!isDashboardChatContext(contextParam)) {
    return NextResponse.json({ error: "Invalid context" }, { status: 400 });
  }

  const connectAgent =
    connectAgentParam && isSpecialistHandoffTarget(connectAgentParam)
      ? connectAgentParam
      : null;

  if (!message && !connectAgent) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  await connectDB();

  const context = contextParam as DashboardChatContext;

  let agentContext: DashboardChatContext =
    agentContextParam && isDashboardChatContext(agentContextParam)
      ? agentContextParam
      : context;

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
      title: (message || CHAT_ASSISTANT_NAMES[connectAgent ?? "head"]).slice(0, 48),
      messages: [],
    });
    await pruneOldChatSessions(userId, context);
  }

  const chefName = session.user.name ?? "Chef";
  const restaurantName =
    (session.user as { restaurantName?: string }).restaurantName ?? "your kitchen";

  const historyForHandoff = conversation.messages.slice(-10).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let handoff: SpecialistHandoffTarget | null = null;
  if (connectAgent) {
    handoff = connectAgent;
    agentContext = connectAgent;
  } else if (context === "head") {
    const detected = detectHandoffFromConversation(message, historyForHandoff);
    if (detected) {
      handoff = detected;
      agentContext = detected;
    }
  }

  let cues;
  let dataContext: string;
  let createExtras = "";

  if (agentContext === "inventory") {
    dataContext = await buildInventoryChatContext(restaurantId);
  } else if (agentContext === "business") {
    dataContext = await buildBusinessChatContext(restaurantId, financePeriod);
  } else if (agentContext === "head") {
    dataContext = await buildHeadChatContext(restaurantId, financePeriod);
  } else {
    const weather = await fetchWeatherCue();
    const ingredients = await Ingredient.find({ restaurantId })
      .select("name expiryDate")
      .lean();
    const pantryExpiringNames = ingredients
      .filter((ingredient) => isIngredientExpiring(ingredient))
      .map((ingredient) => ingredient.name);
    cues = buildCreateCues(weather, new Date(), pantryExpiringNames);
    const cuesText = formatCuesForPrompt(cues);
    dataContext = await buildCreativeChatContext(restaurantId, cuesText);
    createExtras = `When the chef clearly wants to save an idea, call add_suggested_dish with a notes array (at least one entry).
Note kinds: expiring_ingredients, seasonal, high_margin, low_stock, cue, other.
Examples: "Uses bacon, spinach expiring this week" (expiring_ingredients), "Fall seasonal pumpkin special" (seasonal), "Features high-margin avocado & eggs" (high_margin).
Dish **name** must be short (2–5 words) with no supplier brands or pack sizes — brands belong in **description** only.
Only call add_suggested_dish when the chef confirms (e.g. "add it", "save that")${
      confirmSuggestion ? " — the chef just confirmed saving." : "."
    }
Never invent pantry items — only reference slugs from the pantry list when specifying ingredientSlugs.`;
  }

  const handoffNote =
    handoff && (context === "head" || connectAgent)
      ? "\n\nThe chef was just connected to you from another assistant. Read the full conversation history and take over seamlessly — acknowledge what was discussed, then help with their current need."
      : "";

  const systemPrompt =
    buildChatSystemPrompt(
      agentContext,
      chefName,
      restaurantName,
      dataContext,
      createExtras
    ) + handoffNote;

  const history = conversation.messages.slice(-10).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const savedUserMessage = connectAgent
    ? `Connect to ${CHAT_ASSISTANT_NAMES[connectAgent]}`
    : message;

  const llmUserMessage = connectAgent
    ? `The chef clicked Connect in chat to speak with you. Review the conversation above and take over — briefly acknowledge the thread, then help with what they need.`
    : message;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: llmUserMessage },
    ],
    ...(agentContext === "create"
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

  if (agentContext === "create") {
    const toolCall = choice.message.tool_calls?.[0];
    if (toolCall?.type === "function" && toolCall.function.name === "add_suggested_dish") {
      try {
        const args = JSON.parse(toolCall.function.arguments) as {
          name: string;
          description: string;
          classification: string;
          ingredientSlugs?: string[];
          notes?: Array<{ kind: string; text: string }>;
        };
        createdSuggestion = await createSuggestedDish(restaurantId, {
          ...args,
          notes: normalizeSuggestionNotes(args.notes),
        });
        reply =
          reply ||
          `Saved **${createdSuggestion.name}** to Suggested with rationale notes. Open Recipes → Suggested to review.`;
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
      agentContext === "head"
        ? `Ask me what to prioritize today. For stock, sales, or specials, I can point you to the ${inventory}, ${business}, or ${creative}.`
        : agentContext === "inventory"
        ? `Ask me about stock, expiry, or reorder. For sales or new dishes, switch to the ${business} or ${creative}.`
        : agentContext === "business"
          ? `Ask me about sales, margins, or purchases. For stock or specials, switch to the ${inventory} or ${creative}.`
          : `Tell me what kind of special you'd like. For stock or sales, use the ${inventory} or ${business}.`;
  }

  if (handoff) {
    const specialistName = CHAT_ASSISTANT_NAMES[handoff];
    reply = `You're now connected with the **${specialistName}**.\n\n${reply}`;
  }

  conversation.messages.push(
    { role: "user", content: savedUserMessage, createdAt: new Date() },
    { role: "assistant", content: reply, createdAt: new Date() }
  );
  if (conversation.messages.filter((m) => m.role === "user").length === 1) {
    conversation.title = savedUserMessage.slice(0, 48);
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
    agentContext,
    handoff,
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

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  if (!userId) {
    return NextResponse.json({ error: "No user" }, { status: 400 });
  }

  const contextParam = new URL(req.url).searchParams.get("context") ?? "create";
  const conversationId = new URL(req.url).searchParams.get("conversationId");
  if (!isDashboardChatContext(contextParam)) {
    return NextResponse.json({ error: "Invalid context" }, { status: 400 });
  }
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }

  await connectDB();

  const deleted = await Conversation.deleteOne({
    _id: conversationId,
    userId,
    context: contextParam,
  });
  if (!deleted.deletedCount) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const sessions = await Conversation.find({ userId, context: contextParam })
    .sort({ updatedAt: -1 })
    .limit(MAX_CHAT_SESSIONS)
    .select("title updatedAt")
    .lean();

  return NextResponse.json({
    context: contextParam,
    deletedId: conversationId,
    conversations: sessions.map((row) => ({
      id: row._id.toString(),
      title: row.title || "New chat",
      updatedAt: row.updatedAt,
    })),
  });
}
