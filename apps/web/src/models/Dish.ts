import mongoose, { Schema, type Model } from "mongoose";
import type { IImageCandidate } from "@/models/Ingredient";

export interface IIngredientLink {
  ingredientSlug: string;
  qtyPerServing: number;
  unit: string;
  scalesWithSize?: boolean;
  notes?: string;
}

export type RecipeStatus = "new" | "active" | "inactive" | "suggested";

export interface IDish {
  _id: mongoose.Types.ObjectId;
  restaurantId: mongoose.Types.ObjectId;
  slug: string;
  name: string;
  category: string;
  classification?: string;
  sellPrice: number;
  totalSold?: number;
  description?: string;
  ingredientLinks: IIngredientLink[];
  recipeStatus?: RecipeStatus;
  source: string;
  imageUrl?: string;
  imageR2Key?: string;
  imageCandidates?: IImageCandidate[];
  selectedImageIndex?: number;
  imageGenerationAttempted?: boolean;
}

const IngredientLinkSchema = new Schema<IIngredientLink>(
  {
    ingredientSlug: { type: String, required: true },
    qtyPerServing: { type: Number, required: true },
    unit: { type: String, required: true },
    scalesWithSize: { type: Boolean, default: true },
    notes: String,
  },
  { _id: false }
);

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

const DishSchema = new Schema<IDish>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    slug: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, default: "other" },
    classification: { type: String, default: "other" },
    sellPrice: { type: Number, required: true },
    totalSold: { type: Number, default: 0 },
    description: String,
    imageUrl: String,
    imageR2Key: String,
    imageCandidates: { type: [ImageCandidateSchema], default: [] },
    selectedImageIndex: { type: Number, default: 0 },
    imageGenerationAttempted: { type: Boolean, default: false },
    ingredientLinks: { type: [IngredientLinkSchema], default: [] },
    recipeStatus: {
      type: String,
      enum: ["new", "active", "inactive", "suggested"],
    },
    source: { type: String, default: "bill_upload" },
  },
  { timestamps: true }
);

DishSchema.index({ restaurantId: 1, slug: 1 }, { unique: true });

export const Dish: Model<IDish> =
  mongoose.models.Dish ?? mongoose.model<IDish>("Dish", DishSchema);
