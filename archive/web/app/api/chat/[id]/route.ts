import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Conversation } from "@/models/Conversation";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  if (!userId) {
    return NextResponse.json({ error: "No user" }, { status: 400 });
  }

  await connectDB();

  const conversation = await Conversation.findOne({ _id: params.id, userId }).lean();
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: conversation._id.toString(),
    title: conversation.title,
    messages: conversation.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    updatedAt: conversation.updatedAt,
  });
}
