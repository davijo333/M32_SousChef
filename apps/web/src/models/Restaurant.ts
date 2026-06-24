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
  },
  { timestamps: true }
);

RestaurantSchema.index({ nameKey: 1 }, { unique: true, sparse: true });

export const Restaurant: Model<IRestaurant> =
  mongoose.models.Restaurant ??
  mongoose.model<IRestaurant>("Restaurant", RestaurantSchema);
