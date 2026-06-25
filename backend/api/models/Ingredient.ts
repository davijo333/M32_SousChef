import mongoose, { Schema, type Model } from "mongoose";

export interface IUsageUnit {
  unit: string;
  countPerInventoryUnit: number;
  notes?: string;
}

export interface IImageCandidate {
  url: string;
  label?: string;
  source?: string;
  score?: number;
  r2Key?: string;
}

export type IngredientLabel = "new" | "used" | "unused" | "missing";

export interface IIngredient {
  _id: mongoose.Types.ObjectId;
  restaurantId: mongoose.Types.ObjectId;
  /** Stable kitchen id (slug) — shown as UID in UI */
  slug: string;
  /** Stable id: brand + name + pack volume + unit */
  sku?: string;
  name: string;
  category: string;
  inventoryUnit: string;
  currentQty: number;
  reorderThreshold: number;
  expiryDate?: Date | null;
  lastPurchasePrice?: number;
  lastOrderedQty?: number;
  source: string;
  imageUrl?: string;
  imageR2Key?: string;
  imageCandidates?: IImageCandidate[];
  selectedImageIndex?: number;
  /** True after initial image generation was attempted (Process or manual Generate). */
  imageGenerationAttempted?: boolean;
  brandName?: string;
  /** Pantry status label — new from PO, used in recipes, unused, or missing from recipes */
  label?: IngredientLabel;
  usageUnits: IUsageUnit[];
}

const ImageCandidateSchema = new Schema<IImageCandidate>(
  {
    url: { type: String, required: true },
    label: String,
    source: String,
    score: Number,
    r2Key: String,
  },
  { _id: false }
);

const IngredientSchema = new Schema<IIngredient>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    slug: { type: String, required: true },
    sku: String,
    name: { type: String, required: true },
    category: { type: String, required: true },
    inventoryUnit: { type: String, required: true },
    currentQty: { type: Number, required: true },
    reorderThreshold: { type: Number, required: true },
    expiryDate: { type: Date, default: null },
    lastPurchasePrice: Number,
    lastOrderedQty: Number,
    imageUrl: String,
    imageR2Key: String,
    imageCandidates: [ImageCandidateSchema],
    selectedImageIndex: { type: Number, default: 0 },
    imageGenerationAttempted: { type: Boolean, default: false },
    brandName: String,
    label: { type: String, enum: ["new", "used", "unused", "missing"], default: undefined },
    source: { type: String, default: "seed" },
    usageUnits: [
      {
        unit: String,
        countPerInventoryUnit: Number,
        notes: String,
      },
    ],
  },
  { timestamps: true }
);

IngredientSchema.index({ restaurantId: 1, slug: 1 }, { unique: true });
IngredientSchema.index({ restaurantId: 1, sku: 1 }, { unique: true, sparse: true });

export const Ingredient: Model<IIngredient> =
  mongoose.models.Ingredient ??
  mongoose.model<IIngredient>("Ingredient", IngredientSchema);
