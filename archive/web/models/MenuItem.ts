import mongoose, { Schema, type Model } from "mongoose";

export interface IIngredientLink {
  ingredientSlug: string;
  qtyPerServing: number;
  unit: string;
  scalesWithSize?: boolean;
  notes?: string;
}

export interface IMenuItem {
  _id: mongoose.Types.ObjectId;
  restaurantId: mongoose.Types.ObjectId;
  slug: string;
  name: string;
  type: string;
  category: string;
  sellPrice: number;
  description?: string;
  ingredientLinks: IIngredientLink[];
  availableAddOnSlugs: string[];
  addonsEnabled: boolean;
  source: string;
  imageUrl?: string;
  imageR2Key?: string;
}

const MenuItemSchema = new Schema<IMenuItem>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    slug: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, required: true },
    category: { type: String, required: true },
    sellPrice: { type: Number, required: true },
    description: String,
    imageUrl: String,
    imageR2Key: String,
    availableAddOnSlugs: { type: [String], default: [] },
    addonsEnabled: { type: Boolean, default: false },
    ingredientLinks: [
      {
        ingredientSlug: String,
        qtyPerServing: Number,
        unit: String,
        scalesWithSize: { type: Boolean, default: true },
        notes: String,
      },
    ],
    source: { type: String, default: "seed" },
  },
  { timestamps: true }
);

MenuItemSchema.index({ restaurantId: 1, slug: 1 }, { unique: true });

export const MenuItem: Model<IMenuItem> =
  mongoose.models.MenuItem ?? mongoose.model<IMenuItem>("MenuItem", MenuItemSchema);
