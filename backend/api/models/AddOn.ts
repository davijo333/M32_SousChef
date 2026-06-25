import mongoose, { Schema, type Model } from "mongoose";
import type { IIngredientLink, RecipeStatus } from "@backend/models/Dish";
import type { IImageCandidate } from "@backend/models/Ingredient";

export interface IAddOn {
  _id: mongoose.Types.ObjectId;
  restaurantId: mongoose.Types.ObjectId;
  slug: string;
  name: string;
  classification?: string;
  description?: string;
  imageUrl?: string;
  imageR2Key?: string;
  imageCandidates?: IImageCandidate[];
  selectedImageIndex?: number;
  imageGenerationAttempted?: boolean;
  sellPrice: number;
  totalSold?: number;
  /** Dish slugs this add-on can be applied to */
  linkedDishSlugs: string[];
  ingredientLinks: IIngredientLink[];
  recipeStatus?: RecipeStatus;
  source: string;
}

const IngredientLinkSchema = new Schema<IIngredientLink>(
  {
    ingredientSlug: { type: String, required: true },
    qtyPerServing: { type: Number, required: true },
    unit: { type: String, required: true },
    scalesWithSize: { type: Boolean, default: false },
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

const AddOnSchema = new Schema<IAddOn>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    slug: { type: String, required: true },
    name: { type: String, required: true },
    classification: { type: String, default: "addon" },
    description: String,
    imageUrl: String,
    imageR2Key: String,
    imageCandidates: { type: [ImageCandidateSchema], default: [] },
    selectedImageIndex: { type: Number, default: 0 },
    imageGenerationAttempted: { type: Boolean, default: false },
    sellPrice: { type: Number, required: true },
    totalSold: { type: Number, default: 0 },
    linkedDishSlugs: { type: [String], default: [] },
    ingredientLinks: { type: [IngredientLinkSchema], default: [] },
    recipeStatus: {
      type: String,
      enum: ["new", "active", "inactive", "suggested"],
    },
    source: { type: String, default: "bill_upload" },
  },
  { timestamps: true }
);

AddOnSchema.index({ restaurantId: 1, slug: 1 }, { unique: true });

export const AddOn: Model<IAddOn> =
  mongoose.models.AddOn ?? mongoose.model<IAddOn>("AddOn", AddOnSchema);
