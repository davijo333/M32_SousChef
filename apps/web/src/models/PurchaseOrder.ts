import mongoose, { Schema, type Model } from "mongoose";

export interface IPurchaseOrderItem {
  name: string;
  price: number;
  qty: number;
  unit?: string;
  ingredientSlug?: string;
}

export interface IPurchaseOrder {
  _id: mongoose.Types.ObjectId;
  restaurantId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  billUploadId: mongoose.Types.ObjectId;
  poId: string;
  filename: string;
  /** Wholesaler / store name from the order */
  storeName?: string;
  vendor?: string;
  purchaseDate?: Date;
  uploadDate: Date;
  status: "parsed" | "processed";
  items: IPurchaseOrderItem[];
  createdAt: Date;
  updatedAt: Date;
}

const PurchaseOrderItemSchema = new Schema<IPurchaseOrderItem>(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    qty: { type: Number, required: true },
    unit: String,
    ingredientSlug: String,
  },
  { _id: false }
);

const PurchaseOrderSchema = new Schema<IPurchaseOrder>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    billUploadId: { type: Schema.Types.ObjectId, ref: "BillUpload", required: true },
    poId: { type: String, required: true },
    filename: { type: String, required: true },
    storeName: String,
    vendor: String,
    purchaseDate: Date,
    uploadDate: { type: Date, required: true },
    status: { type: String, enum: ["parsed", "processed"], default: "parsed" },
    items: [PurchaseOrderItemSchema],
  },
  { timestamps: true }
);

PurchaseOrderSchema.index({ restaurantId: 1, poId: 1 }, { unique: true });
PurchaseOrderSchema.index({ billUploadId: 1 }, { unique: true });

export const PurchaseOrder: Model<IPurchaseOrder> =
  mongoose.models.PurchaseOrder ??
  mongoose.model<IPurchaseOrder>("PurchaseOrder", PurchaseOrderSchema);
