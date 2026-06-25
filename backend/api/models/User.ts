import mongoose, { Schema, type Model } from "mongoose";

export interface IUser {
  _id: mongoose.Types.ObjectId;
  email: string;
  passwordHash?: string;
  /** Chef / owner display name */
  name: string;
  restaurantId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String },
    name: { type: String, required: true },
    restaurantId: { type: Schema.Types.ObjectId, ref: "Restaurant" },
  },
  { timestamps: true }
);

export const User: Model<IUser> =
  mongoose.models.User ?? mongoose.model<IUser>("User", UserSchema);
