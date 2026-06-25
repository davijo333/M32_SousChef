import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import mongoose from "mongoose";
import { authOptions } from "@/lib/auth";
import { getRouteSession } from "@/lib/route-session";
import {
  detectHandoffFromConversation,
  detectUploadBatchHandoffTarget,
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
import { BillUpload } from "@/models/BillUpload";
import { Ingredient } from "@/models/Ingredient";
import { callLangChainAgentChat } from "@/lib/agent-chat";
import type { ChatUploadBatchPayload } from "@/lib/chat-bill-upload-queue";
import type { RecipeBuildPlanPayload } from "@/lib/agent-recipe-build";
import type { ChatCatalogDraftPayload } from "@/lib/chat-catalog-draft";
import {
  detectRecipeBuildIntent,
  detectRecipeFinalizeConfirm,
  shouldUseSuggestionConfirmOnly,
} from "@/lib/chat-recipe-build-intent";
import { detectUploadConfirm } from "@/lib/chat-upload-intent";
import {
  detectBusinessConfirm,
  detectInventoryConfirm,
  detectMenuConfirm,
  executeAgentPendingAction,
  executeConfirmedUploadBatch,
} from "@/lib/agent-pending-actions";

const USE_LANGCHAIN_AGENTS = process.env.USE_LANGCHAIN_AGENTS !== "false";

export const dynamic = "force-dynamic";

function parseUploadBatch(body: Record<string, unknown>): ChatUploadBatchPayload | undefined {
  const raw = body.uploadBatch;
  if (!raw || typeof raw !== "object") return undefined;
  const batch = raw as Record<string, unknown>;
  const total = Number(batch.total ?? 0);
  const ready = Number(batch.ready ?? 0);
  if (total <= 0) return undefined;

  const rawSlices = Array.isArray(batch.slices) ? batch.slices : [];
  const slices = rawSlices
    .map((slice) => {
      if (!slice || typeof slice !== "object") return null;
      const row = slice as Record<string, unknown>;
      const billType = row.billType === "customer" ? "customer" : "supplier";
      return {
        billType,
        ready: Number(row.ready ?? 0),
        failed: Number(row.failed ?? 0),
        filenames: Array.isArray(row.filenames) ? row.filenames.map(String) : [],
        readyBillIds: Array.isArray(row.readyBillIds)
          ? row.readyBillIds.map(String).filter(Boolean)
          : [],
      };
    })
    .filter(Boolean) as ChatUploadBatchPayload["slices"];

  if (!slices.length && ready > 0) {
    const billType = batch.billType === "customer" ? "customer" : "supplier";
    slices.push({
      billType,
      ready,
      failed: Number(batch.failed ?? 0),
      filenames: Array.isArray(batch.filenames) ? batch.filenames.map(String) : [],
      readyBillIds: Array.isArray(batch.readyBillIds)
        ? batch.readyBillIds.map(String).filter(Boolean)
        : [],
    });
  }

  return {
    state: batch.state === "error" ? "error" : "ready",
    total,
    ready,
    failed: Number(batch.failed ?? 0),
    slices,
    billType:
      batch.billType === "customer"
        ? "customer"
        : batch.billType === "supplier"
          ? "supplier"
          : slices.length === 1
            ? slices[0].billType
            : undefined,
    identifications: Array.isArray(batch.identifications)
      ? (batch.identifications as Array<Record<string, unknown>>)
          .map((row) => ({
            filename: String(row.filename ?? ""),
            billType: row.billType === "customer" ? "customer" : "supplier",
            reason: String(row.reason ?? ""),
            confidence: Number(row.confidence ?? 0.7),
          }))
          .filter((row) => row.filename)
      : undefined,
  };
}

function parseCatalogDraft(body: Record<string, unknown>): ChatCatalogDraftPayload | undefined {
  const raw = body.catalogDraft;
  if (!raw || typeof raw !== "object") return undefined;
  const draft = raw as Record<string, unknown>;
  const name = String(draft.name ?? "").trim();
  if (!name) return undefined;
  return {
    itemType: draft.itemType === "dish" ? "dish" : "ingredient",
    name,
    brandName: draft.brandName ? String(draft.brandName) : undefined,
    category: draft.category ? String(draft.category) : undefined,
    classification: draft.classification ? String(draft.classification) : undefined,
    description: draft.description ? String(draft.description) : undefined,
    confidence: Number(draft.confidence ?? 0.7),
    imageUrl: draft.imageUrl ? String(draft.imageUrl) : undefined,
    source: draft.source ? String(draft.source) : undefined,
    filename: draft.filename ? String(draft.filename) : undefined,
  };
}

function parseRecipeBuild(body: Record<string, unknown>): RecipeBuildPlanPayload | undefined {
  const raw = body.recipeBuild;
  if (!raw || typeof raw !== "object") return undefined;
  const plan = raw as Record<string, unknown>;
  const dishName = String(plan.dishName ?? "").trim();
  if (!dishName) return undefined;
  const ingredients = Array.isArray(plan.ingredients)
    ? plan.ingredients
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const ing = row as Record<string, unknown>;
          const name = String(ing.name ?? "").trim();
          if (!name) return null;
          return {
            key: String(ing.key ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-")),
            name,
            qtyPerServing: Number(ing.qtyPerServing ?? 1),
            unit: String(ing.unit ?? "each"),
            pantrySlug: ing.pantrySlug ? String(ing.pantrySlug) : undefined,
            pantryName: ing.pantryName ? String(ing.pantryName) : undefined,
            committedSlug: ing.committedSlug ? String(ing.committedSlug) : undefined,
            options: Array.isArray(ing.options) ? ing.options : undefined,
            selectedOption:
              ing.selectedOption && typeof ing.selectedOption === "object"
                ? (ing.selectedOption as RecipeBuildPlanPayload["ingredients"][0]["selectedOption"])
                : undefined,
          };
        })
        .filter(Boolean)
    : [];
  if (!ingredients.length) return undefined;
  return {
    dishName,
    description: plan.description ? String(plan.description) : undefined,
    classification: plan.classification ? String(plan.classification) : undefined,
    sellPrice: plan.sellPrice != null ? Number(plan.sellPrice) : null,
    ingredients: ingredients as RecipeBuildPlanPayload["ingredients"],
    status: plan.status === "ready_to_finalize" ? "ready_to_finalize" : "selecting",
  };
}

async function pendingUploadHandoffTarget(
  userId: string
): Promise<SpecialistHandoffTarget | null> {
  const [supplierPending, customerPending] = await Promise.all([
    BillUpload.countDocuments({ userId, billType: "supplier", status: "pending_review" }),
    BillUpload.countDocuments({ userId, billType: "customer", status: "pending_review" }),
  ]);
  if (supplierPending > 0) return "inventory";
  if (customerPending > 0) return "business";
  return null;
}

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
  const userMessage = String(body.userMessage ?? body.message ?? "").trim();
  const conversationId = body.conversationId as string | undefined;
  const newChat = Boolean(body.newChat);
  const contextParam = String(body.context ?? "create");
  const agentContextParam = body.agentContext as string | undefined;
  const connectAgentParam = body.connectAgent as string | undefined;
  const financePeriod = parseFinancePeriod(body.financeView);
  const recentBillIds = Array.isArray(body.recentBillIds)
    ? body.recentBillIds.map(String).filter(Boolean)
    : [];
  const uploadBatch = parseUploadBatch(body as Record<string, unknown>);
  const catalogDraft = parseCatalogDraft(body as Record<string, unknown>);
  const recipeBuild = parseRecipeBuild(body as Record<string, unknown>);
  const recipeBuildIntent = detectRecipeBuildIntent(userMessage);
  const confirmSuggestion =
    (Boolean(body.confirmSuggestion) ||
      detectMenuConfirm(userMessage, agentContextParam ?? contextParam)) &&
    (shouldUseSuggestionConfirmOnly(userMessage) || !recipeBuildIntent);
  const confirmRecipeBuild =
    recipeBuildIntent && detectRecipeFinalizeConfirm(userMessage);
  const effectiveConfirmSuggestion = confirmSuggestion || Boolean(confirmRecipeBuild);
  const confirmInventory =
    Boolean(body.confirmInventory) ||
    detectInventoryConfirm(userMessage, agentContextParam ?? contextParam);
  const confirmBusiness =
    Boolean(body.confirmBusiness) ||
    detectBusinessConfirm(userMessage, agentContextParam ?? contextParam);
  const confirmUpload =
    detectUploadConfirm(userMessage) &&
    (contextParam === "head" || agentContextParam === "head" || !agentContextParam);

  if (!isDashboardChatContext(contextParam)) {
    return NextResponse.json({ error: "Invalid context" }, { status: 400 });
  }

  const connectAgent =
    connectAgentParam && isSpecialistHandoffTarget(connectAgentParam)
      ? connectAgentParam
      : null;

  if (!message && !connectAgent && !uploadBatch && !catalogDraft) {
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
    const uploadHandoff =
      detectUploadBatchHandoffTarget(uploadBatch, confirmUpload) ??
      (confirmUpload ? await pendingUploadHandoffTarget(userId) : null);
    if (uploadHandoff) {
      handoff = uploadHandoff;
      agentContext = uploadHandoff;
    } else {
      const detected = detectHandoffFromConversation(userMessage, historyForHandoff, {
        skipIfUploadConfirm: true,
      });
      if (detected) {
        handoff = detected;
        agentContext = detected;
      }
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
    createExtras = `When the chef wants a **full kitchen build** (dish + pantry ingredients + images), use apply_menu:
1. plan_recipe_build with dish name and recipe_ingredients [{name, qty, unit}]
2. update_recipe_selections when they pick store products (e.g. mango: 1)
3. finalize_recipe_build after they confirm — NOT add_suggested_dish.

Use add_suggested_dish ONLY for brainstorm ideas to save in Recipes → Suggested (no pantry adds).

Note kinds for suggestions only: expiring_ingredients, seasonal, high_margin, low_stock, cue, other.
Dish **name** must be short (2–5 words) without supplier brands.
Only call apply_menu when the chef confirms${
      effectiveConfirmSuggestion ? " — the chef just confirmed." : "."
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

  let reply = "";
  let createdSuggestion: { slug: string; name: string } | null = null;
  let agentResultHandoff: SpecialistHandoffTarget | null = handoff;
  let navigationAction: { path: string; label: string; agent?: SpecialistHandoffTarget } | null =
    null;

  let recipeBuildPlan: RecipeBuildPlanPayload | null = recipeBuild ?? null;

  if (USE_LANGCHAIN_AGENTS) {
    const agentResult = await callLangChainAgentChat({
      restaurantId,
      userId,
      chefName,
      restaurantName,
      message: userMessage || message,
      context,
      agentContext,
      connectAgent,
      history,
      financePeriod,
      cuesText: cues ? formatCuesForPrompt(cues) : undefined,
      recentBillIds:
        uploadBatch?.slices.flatMap((slice) => slice.readyBillIds) ?? recentBillIds,
      uploadBatch,
      catalogDraft,
      recipeBuild: recipeBuild ?? undefined,
      confirmSuggestion: effectiveConfirmSuggestion,
      confirmInventory: confirmInventory || confirmUpload,
      confirmBusiness: confirmBusiness || confirmUpload,
    });

    if (agentResult) {
      reply = agentResult.reply;
      agentContext = agentResult.agentContext;
      if (agentResult.handoff) {
        agentResultHandoff = agentResult.handoff;
      }
      if (agentResult.navigationAction) {
        navigationAction = agentResult.navigationAction;
      }
      if (agentResult.suggestionAction && !recipeBuildIntent && !recipeBuildPlan) {
        try {
          createdSuggestion = await createSuggestedDish(restaurantId, {
            ...agentResult.suggestionAction,
            notes: normalizeSuggestionNotes(agentResult.suggestionAction.notes),
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
      if (agentResult.recipeBuildPlan) {
        recipeBuildPlan = agentResult.recipeBuildPlan;
      }
      if (confirmUpload) {
        try {
          const batchResult = await executeConfirmedUploadBatch(
            restaurantId,
            userId,
            uploadBatch
          );
          if (batchResult) {
            reply = reply ? `${reply}\n\n${batchResult}` : batchResult;
          }
        } catch (err) {
          reply =
            (reply ? `${reply}\n\n` : "") +
            (err instanceof Error ? err.message : "Could not process uploaded bills.");
        }
      } else if (agentResult.pendingAction) {
        try {
          const actionMessage = await executeAgentPendingAction(
            restaurantId,
            userId,
            agentResult.pendingAction
          );
          if (agentResult.pendingAction?.kind === "finalize_recipe_build") {
            recipeBuildPlan = null;
          }
          reply = reply ? `${reply}\n\n${actionMessage}` : actionMessage;
        } catch (err) {
          reply =
            (reply ? `${reply}\n\n` : "") +
            (err instanceof Error ? err.message : "Could not complete that action.");
        }
      }
    }
  }

  if (!reply) {
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
            tool_choice:
              effectiveConfirmSuggestion && !recipeBuildIntent
                ? { type: "function" as const, function: { name: "add_suggested_dish" } }
                : "auto",
          }
        : {}),
    });

    const choice = completion.choices[0];
    reply = choice.message.content ?? "";

    if (agentContext === "create" && !recipeBuildIntent && !recipeBuildPlan) {
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

  if (agentResultHandoff) {
    const specialistName = CHAT_ASSISTANT_NAMES[agentResultHandoff];
    if (!/you're now connected with/i.test(reply)) {
      reply = `You're now connected with the **${specialistName}**.\n\n${reply}`;
    }
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
    handoff: agentResultHandoff,
    navigationAction,
    conversationId: conversation._id.toString(),
    conversations: sessions.map((session) => ({
      id: session._id.toString(),
      title: session.title || "New chat",
      updatedAt: session.updatedAt,
    })),
    cues,
    createdSuggestion,
    recipeBuildPlan,
  });
}

export async function DELETE(req: Request) {
  const session = await getRouteSession(req);
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
  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 });
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
