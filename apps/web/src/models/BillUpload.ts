import mongoose, { Schema, type Model } from "mongoose";
import type { PipelineEnrichedRow } from "@/lib/apply-pipeline-enrichment";

export interface IBillLine {
  rawName: string;
  normalizedName?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  confidence: number;
  suggestedCategory: "ingredient" | "menu_item";
  included: boolean;
  matchedIngredientSlug?: string;
  matchedMenuItemSlug?: string;
  matchedDishSlug?: string;
  matchedAddOnSlug?: string;
  /** For menu_item lines: dish vs add-on */
  menuItemKind?: "dish" | "addon";
  /** Menu group for dishes/add-ons (sandwich, coffee, cheese, protein, …) */
  classification?: string;
  /** Pantry category for supplier ingredient lines */
  ingredientCategory?: string;
  /** POS / invoice line context for catalog image generation */
  description?: string;
}

export interface IBillUpload {
  _id: mongoose.Types.ObjectId;
  restaurantId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  billType: "supplier" | "customer";
  vendor: string;
  billDate?: string;
  invoiceNumber?: string;
  filename: string;
  fileR2Key?: string;
  fileUrl?: string;
  mimeType?: string;
  status: "pending_review" | "confirmed" | "discarded";
  lines: IBillLine[];
  pipelineEnriched?: PipelineEnrichedRow[];
  createdAt: Date;
  updatedAt: Date;
}

const BillLineSchema = new Schema<IBillLine>(
  {
    rawName: { type: String, required: true },
    normalizedName: String,
    quantity: { type: Number, required: true },
    unit: { type: String, required: true },
    unitPrice: { type: Number, required: true },
    lineTotal: { type: Number, required: true },
    confidence: { type: Number, required: true },
    suggestedCategory: { type: String, enum: ["ingredient", "menu_item"], required: true },
    included: { type: Boolean, default: true },
    matchedIngredientSlug: String,
    matchedMenuItemSlug: String,
    matchedDishSlug: String,
    matchedAddOnSlug: String,
    menuItemKind: { type: String, enum: ["dish", "addon"] },
    classification: String,
    ingredientCategory: String,
    description: String,
  },
  { _id: false }
);

const BillUploadSchema = new Schema<IBillUpload>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    billType: { type: String, enum: ["supplier", "customer"], required: true },
    vendor: { type: String, default: "" },
    billDate: String,
    invoiceNumber: String,
    filename: { type: String, required: true },
    fileR2Key: String,
    fileUrl: String,
    mimeType: String,
    status: {
      type: String,
      enum: ["pending_review", "confirmed", "discarded"],
      default: "pending_review",
    },
    lines: [BillLineSchema],
    pipelineEnriched: { type: Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

BillUploadSchema.index({ userId: 1, billType: 1, createdAt: -1 });

export const BillUpload: Model<IBillUpload> =
  mongoose.models.BillUpload ??
  mongoose.model<IBillUpload>("BillUpload", BillUploadSchema);
