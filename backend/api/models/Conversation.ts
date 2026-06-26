import mongoose, { Schema, type Model } from "mongoose";

import type { DashboardChatContext } from "@backend/services/agents/dashboard-chat";
import type { WorkflowStatePayload } from "@backend/services/chat/workflow-state";

export type { WorkflowStatePayload };

export interface IMessage {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date;
}

export interface IConversation {
  _id: mongoose.Types.ObjectId;
  restaurantId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  context: DashboardChatContext;
  title: string;
  messages: IMessage[];
  workflowState?: WorkflowStatePayload | null;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    context: {
      type: String,
      enum: ["head", "inventory", "business", "create"],
      default: "create",
      required: true,
    },
    title: { type: String, default: "New chat" },
    workflowState: {
      type: {
        workflowId: { type: String, required: true },
        stepId: { type: String, required: true },
        lockedName: { type: String },
        gatesPassed: [{ type: String }],
        baggage: { type: Schema.Types.Mixed },
      },
      default: null,
    },
    messages: [
      {
        role: { type: String, enum: ["user", "assistant", "system"], required: true },
        content: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

ConversationSchema.index({ userId: 1, context: 1, updatedAt: -1 });
ConversationSchema.index({ userId: 1, updatedAt: -1 });

export const Conversation: Model<IConversation> =
  mongoose.models.Conversation ??
  mongoose.model<IConversation>("Conversation", ConversationSchema);
