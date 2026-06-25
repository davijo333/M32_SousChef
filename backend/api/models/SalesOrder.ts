import mongoose, { Schema, type Model } from "mongoose";

export interface ISalesOrderItem {
  name: string;
  price: number;
  qty: number;
  unit?: string;
  dishSlug?: string;
  addOnSlug?: string;
  itemKind: "dish" | "addon";
}

export interface ISalesOrder {
  _id: mongoose.Types.ObjectId;
  restaurantId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  billUploadId: mongoose.Types.ObjectId;
  soId: string;
  filename: string;
  vendor?: string;
  saleDate?: Date;
  uploadDate: Date;
  status: "parsed" | "processed";
  items: ISalesOrderItem[];
  createdAt: Date;
  updatedAt: Date;
}

const SalesOrderItemSchema = new Schema<ISalesOrderItem>(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    qty: { type: Number, required: true },
    unit: String,
    dishSlug: String,
    addOnSlug: String,
    itemKind: { type: String, enum: ["dish", "addon"], required: true },
  },
  { _id: false }
);

const SalesOrderSchema = new Schema<ISalesOrder>(
  {
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    billUploadId: { type: Schema.Types.ObjectId, ref: "BillUpload", required: true },
    soId: { type: String, required: true },
    filename: { type: String, required: true },
    vendor: String,
    saleDate: Date,
    uploadDate: { type: Date, required: true },
    status: { type: String, enum: ["parsed", "processed"], default: "parsed" },
    items: [SalesOrderItemSchema],
  },
  { timestamps: true }
);

SalesOrderSchema.index({ restaurantId: 1, soId: 1 }, { unique: true });
SalesOrderSchema.index({ billUploadId: 1 }, { unique: true });

export const SalesOrder: Model<ISalesOrder> =
  mongoose.models.SalesOrder ??
  mongoose.model<ISalesOrder>("SalesOrder", SalesOrderSchema);
