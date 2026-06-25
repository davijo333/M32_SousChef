import mongoose, { Schema, type Model } from "mongoose";
import type { RecipeStatus } from "@backend/models/Dish";

export type RecipeProgress = "linking" | "pricing" | "ready" | "failed";
export type RecipeKind = "dish" | "addon";

export interface IRecipeIngredient {
  ingredientSlug: string;
  ingredientName: string;
  qtyUsed: number;
  unit: string;
}

export interface IRecipe {
  _id: mongoose.Types.ObjectId;
  restaurantId: mongoose.Types.ObjectId;
  recipeNumber: number;
  kind: RecipeKind;
  /** Dish or add-on slug */
  targetSlug: string;
  dishName: string;
  servingQty: number;
  ingredients: IRecipeIngredient[];
  foodCost: number;
  margin: number;
  sellPrice: number;
  progress: RecipeProgress;
  progressMessage?: string;
  recipeStatus?: RecipeStatus;
  instructions: string[];
}

const RecipeIngredientSchema = new Schema<IRecipeIngredient>(
  {
    ingredientSlug: { type: String, required: true },
    ingredientName: { type: String, required: true },
    qtyUsed: { type: Number, required: true },
    unit: { type: String, required: true },
  },
  { _id: false }
);

const RecipeSchema = new Schema<IRecipe>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    recipeNumber: { type: Number, required: true },
    kind: { type: String, enum: ["dish", "addon"], required: true },
    targetSlug: { type: String, required: true },
    dishName: { type: String, required: true },
    servingQty: { type: Number, default: 1 },
    ingredients: { type: [RecipeIngredientSchema], default: [] },
    foodCost: { type: Number, default: 0 },
    margin: { type: Number, default: 3 },
    sellPrice: { type: Number, default: 0 },
    progress: {
      type: String,
      enum: ["linking", "pricing", "ready", "failed"],
      default: "linking",
    },
    progressMessage: String,
    recipeStatus: {
      type: String,
      enum: ["new", "active", "inactive", "suggested"],
    },
    instructions: { type: [String], default: [] },
  },
  { timestamps: true }
);

RecipeSchema.index({ restaurantId: 1, recipeNumber: 1 }, { unique: true });
RecipeSchema.index({ restaurantId: 1, kind: 1, targetSlug: 1 }, { unique: true });

export const Recipe: Model<IRecipe> =
  mongoose.models.Recipe ?? mongoose.model<IRecipe>("Recipe", RecipeSchema);
