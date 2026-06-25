import mongoose, { Schema, type Model } from "mongoose";

export interface IRestaurant {
  _id: mongoose.Types.ObjectId;
  /** Shared inventory scope — multiple chefs can link here in v2 */
  name: string;
  /** Lowercase normalized name — globally unique when kitchenNameSet */
  nameKey?: string;
  /** False until owner picks a unique kitchen name */
  kitchenNameSet: boolean;
  isSeeded: boolean;
  createdBy?: mongoose.Types.ObjectId;
  /** @deprecated v1 — use User.restaurantId; kept for legacy DB rows */
  userId?: mongoose.Types.ObjectId;
  /** True while Recipe Agent is linking dishes/add-ons to pantry */
  recipeAgentCooking?: boolean;
  recipeAgentWorkCount?: number;
  createdAt: Date;
}

const RestaurantSchema = new Schema<IRestaurant>(
  {
    name: { type: String, required: true, default: "My Kitchen" },
    nameKey: { type: String },
    kitchenNameSet: { type: Boolean, default: false },
    isSeeded: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    recipeAgentCooking: { type: Boolean, default: false },
    recipeAgentWorkCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

RestaurantSchema.index({ nameKey: 1 }, { unique: true, sparse: true });

export const Restaurant: Model<IRestaurant> =
  mongoose.models.Restaurant ??
  mongoose.model<IRestaurant>("Restaurant", RestaurantSchema);
