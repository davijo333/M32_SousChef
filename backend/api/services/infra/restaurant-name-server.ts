import mongoose from "mongoose";
import {
  normalizeKitchenNameKey,
  PLACEHOLDER_KITCHEN_NAME,
  validateKitchenName,
} from "@backend/services/infra/kitchen-name";
import { Restaurant } from "@backend/models/Restaurant";
import { User } from "@backend/models/User";
import type { HydratedDocument } from "mongoose";
import type { IRestaurant } from "@backend/models/Restaurant";
import type { IUser } from "@backend/models/User";

type SessionUser = {
  id?: string;
  email?: string | null;
  name?: string | null;
};

/** Heal stale JWT user ids after DB reset by falling back to email. */
export async function resolveSessionUser(
  sessionUser: SessionUser
): Promise<HydratedDocument<IUser>> {
  const { connectDB } = await import("@backend/services/infra/mongodb");
  await connectDB();

  if (sessionUser.id) {
    const byId = await User.findById(sessionUser.id);
    if (byId) return byId;
  }

  const email = sessionUser.email?.trim().toLowerCase();
  if (email) {
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        email,
        name: sessionUser.name?.trim() || "Chef",
      });
    }
    return user;
  }

  throw new Error("User not found");
}

export async function ensureRestaurantForSession(
  sessionUser: SessionUser
): Promise<HydratedDocument<IRestaurant>> {
  const user = await resolveSessionUser(sessionUser);
  return ensureRestaurantForUser(user._id.toString());
}

/** Resolve or create the restaurant row for a user (heals stale IDs after DB reset). */
export async function ensureRestaurantForUser(
  userId: string
): Promise<HydratedDocument<IRestaurant>> {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  if (user.restaurantId) {
    const byId = await Restaurant.findById(user.restaurantId);
    if (byId) return byId;
    user.restaurantId = undefined;
    await user.save();
  }

  const legacy = await Restaurant.findOne({ createdBy: user._id });
  if (legacy) {
    user.restaurantId = legacy._id;
    await user.save();
    return legacy;
  }

  const byOldOwner = await Restaurant.findOne({ userId: user._id });
  if (byOldOwner) {
    user.restaurantId = byOldOwner._id;
    byOldOwner.createdBy = user._id;
    await Promise.all([user.save(), byOldOwner.save()]);
    return byOldOwner;
  }

  const created = await Restaurant.create({
    name: PLACEHOLDER_KITCHEN_NAME,
    kitchenNameSet: false,
    isSeeded: false,
    createdBy: user._id,
    userId: user._id,
  });
  user.restaurantId = created._id;
  await user.save();
  return created;
}

export async function isKitchenNameTaken(
  name: string,
  exceptRestaurantId?: string
): Promise<boolean> {
  const nameKey = normalizeKitchenNameKey(name);
  if (!nameKey) return true;

  const query: Record<string, unknown> = { nameKey };
  if (exceptRestaurantId) {
    query._id = { $ne: new mongoose.Types.ObjectId(exceptRestaurantId) };
  }

  const existing = await Restaurant.findOne(query).select("_id").lean();
  return Boolean(existing);
}

export async function assignKitchenName(
  restaurantId: string,
  name: string
): Promise<{ ok: true; name: string } | { ok: false; error: string; status: number }> {
  const validationError = validateKitchenName(name);
  if (validationError) {
    return { ok: false, error: validationError, status: 400 };
  }

  const trimmed = name.trim();
  const nameKey = normalizeKitchenNameKey(trimmed);

  if (await isKitchenNameTaken(trimmed, restaurantId)) {
    return {
      ok: false,
      error: "That kitchen name is already taken. Try another.",
      status: 409,
    };
  }

  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) {
    return { ok: false, error: "Restaurant not found", status: 404 };
  }

  restaurant.name = trimmed;
  restaurant.nameKey = nameKey;
  restaurant.kitchenNameSet = true;
  try {
    await restaurant.save();
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 11000) {
      return {
        ok: false,
        error: "That kitchen name is already taken. Try another.",
        status: 409,
      };
    }
    throw err;
  }

  return { ok: true, name: trimmed };
}

/** Backfill flags and nameKey for restaurants created before uniqueness was enforced. */
export async function ensureRestaurantNameKey(restaurant: {
  _id: mongoose.Types.ObjectId;
  name: string;
  nameKey?: string;
  kitchenNameSet?: boolean;
}): Promise<{ kitchenNameSet: boolean; name: string }> {
  const legacyPlaceholders = new Set(["My Diner", PLACEHOLDER_KITCHEN_NAME, "Unnamed Kitchen"]);

  if (restaurant.kitchenNameSet == null) {
    const hasCustomName =
      Boolean(restaurant.name?.trim()) && !legacyPlaceholders.has(restaurant.name);
    if (hasCustomName) {
      const nameKey = normalizeKitchenNameKey(restaurant.name);
      const taken = await isKitchenNameTaken(restaurant.name, restaurant._id.toString());
      if (!taken) {
        await Restaurant.updateOne(
          { _id: restaurant._id },
          { $set: { kitchenNameSet: true, nameKey } }
        );
        return { kitchenNameSet: true, name: restaurant.name };
      }
    }
    await Restaurant.updateOne(
      { _id: restaurant._id },
      { $set: { kitchenNameSet: false, name: PLACEHOLDER_KITCHEN_NAME } }
    );
    return { kitchenNameSet: false, name: PLACEHOLDER_KITCHEN_NAME };
  }

  if (restaurant.kitchenNameSet && !restaurant.nameKey && restaurant.name) {
    const nameKey = normalizeKitchenNameKey(restaurant.name);
    await Restaurant.updateOne({ _id: restaurant._id }, { $set: { nameKey } });
  }

  return {
    kitchenNameSet: Boolean(restaurant.kitchenNameSet),
    name: restaurant.name,
  };
}
