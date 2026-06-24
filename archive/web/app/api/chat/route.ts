import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { authOptions } from "@/lib/auth";
import { MAX_CHAT_SESSIONS } from "@/lib/chat-retention";
import { formatStockAnswer } from "@/lib/inventory-engine";
import { connectDB } from "@/lib/mongodb";
import { Conversation } from "@/models/Conversation";
import { Ingredient } from "@/models/Ingredient";
import { MenuItem } from "@/models/MenuItem";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function toolGetInventory(
  restaurantId: string,
  query?: string
): Promise<string> {
  const ingredients = await Ingredient.find({ restaurantId }).lean();
  if (!ingredients.length) {
    return "No ingredients in inventory yet. Upload a supplier bill or load the Sunrise Diner demo.";
  }

  if (query) {
    const q = query.toLowerCase();
    const match = ingredients.find(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.slug.toLowerCase().includes(q) ||
        q.includes(i.name.toLowerCase())
    );
    if (match) {
      const kitchenUnit =
        q.includes("slice") || q.includes("slices")
          ? "slice"
          : q.includes("oz") || q.includes("ounce")
            ? "oz"
            : undefined;
      return formatStockAnswer(
        match.name,
        {
          slug: match.slug,
          inventoryUnit: match.inventoryUnit,
          currentQty: match.currentQty,
          usageUnits: match.usageUnits,
        },
        kitchenUnit
      );
    }
  }

  const low = ingredients.filter((i) => i.currentQty < i.reorderThreshold);
  const expiring = ingredients.filter(
    (i) => i.expiryDate && new Date(i.expiryDate) < new Date(Date.now() + 7 * 86400000)
  );

  const lines = [
    `You have ${ingredients.length} ingredients on hand.`,
    low.length
      ? `Low stock: ${low.map((i) => `${i.name} (${i.currentQty} ${i.inventoryUnit})`).join(", ")}.`
      : "No items below reorder threshold.",
    expiring.length
      ? `Expiring within 7 days: ${expiring.map((i) => i.name).join(", ")}.`
      : "",
  ].filter(Boolean);

  return lines.join(" ");
}

async function toolListMenu(restaurantId: string): Promise<string> {
  const items = await MenuItem.find({ restaurantId }).lean();
  if (!items.length) return "No menu items yet.";
  return items.map((m) => `${m.name} — $${m.sellPrice.toFixed(2)}`).join("\n");
}

async function pruneOldChatSessions(userId: string) {
  const excess = await Conversation.find({ userId })
    .sort({ updatedAt: 1 })
    .skip(MAX_CHAT_SESSIONS)
    .select("_id")
    .lean();

  for (const conv of excess) {
    await Conversation.deleteOne({ _id: conv._id });
  }
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

  const { message, conversationId } = await req.json();
  if (!message?.trim()) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  await connectDB();

  let conversation = conversationId
    ? await Conversation.findOne({ _id: conversationId, userId })
    : null;

  if (!conversation) {
    conversation = await Conversation.create({
      restaurantId,
      userId,
      title: message.slice(0, 40),
      messages: [],
    });
    await pruneOldChatSessions(userId);
  }

  const lower = message.toLowerCase();
  let toolContext = "";

  if (
    lower.includes("how much") ||
    lower.includes("remaining") ||
    lower.includes("left") ||
    lower.includes("stock") ||
    lower.includes("inventory")
  ) {
    toolContext = await toolGetInventory(restaurantId, message);
  } else if (lower.includes("menu") || (lower.includes("list") && lower.includes("sandwich"))) {
    toolContext = await toolListMenu(restaurantId);
  } else if (lower.includes("reorder") || lower.includes("expir") || lower.includes("special")) {
    toolContext = await toolGetInventory(restaurantId);
  }

  const history = conversation.messages.slice(-12).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const chefName = session.user.name ?? "Chef";
  const restaurantName =
    (session.user as { restaurantName?: string }).restaurantName ?? "the café";

  const systemPrompt = `You are Sous Chef, an AI sous chef assisting Chef ${chefName} at ${restaurantName}.
Answer in plain language for a busy café owner. Use ONLY the inventory/menu data provided below — never invent quantities.
If asked about other restaurants, users, or database internals, refuse politely.
${toolContext ? `\nCurrent data from tools:\n${toolContext}` : ""}`;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message },
    ],
  });

  const reply =
    completion.choices[0].message.content ?? "Sorry, I could not generate a response.";

  conversation.messages.push(
    { role: "user", content: message, createdAt: new Date() },
    { role: "assistant", content: reply, createdAt: new Date() }
  );
  await conversation.save();

  return NextResponse.json({
    reply,
    conversationId: conversation._id.toString(),
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  if (!userId) {
    return NextResponse.json({ error: "No user" }, { status: 400 });
  }

  await connectDB();

  const conversations = await Conversation.find({ userId })
    .sort({ updatedAt: -1 })
    .limit(MAX_CHAT_SESSIONS)
    .select("_id title updatedAt messages")
    .lean();

  return NextResponse.json({
    conversations: conversations.map((c) => ({
      id: c._id.toString(),
      title: c.title,
      updatedAt: c.updatedAt,
      preview: c.messages[c.messages.length - 1]?.content?.slice(0, 80) ?? "",
    })),
    maxSessions: MAX_CHAT_SESSIONS,
  });
}
