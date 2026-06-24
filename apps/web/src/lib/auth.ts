import { connectDB } from "@/lib/mongodb";
import {
  ensureRestaurantForUser,
  resolveSessionUser,
} from "@/lib/restaurant-name-server";
import { User } from "@/models/User";
import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

async function resolveRestaurantForUser(user: InstanceType<typeof User>) {
  try {
    return await ensureRestaurantForUser(user._id.toString());
  } catch {
    return null;
  }
}

async function ensureUserAndRestaurant(params: {
  email: string;
  name?: string | null;
  passwordHash?: string;
}) {
  let user = await User.findOne({ email: params.email.toLowerCase() });
  if (!user) {
    user = await User.create({
      email: params.email.toLowerCase(),
      name: params.name?.trim() || "Chef",
      ...(params.passwordHash ? { passwordHash: params.passwordHash } : {}),
    });
  } else if (!user.name && params.name) {
    user.name = params.name.trim();
    await user.save();
  }

  let restaurant = await resolveRestaurantForUser(user);
  if (!restaurant) {
    restaurant = await ensureRestaurantForUser(user._id.toString());
  }

  return { user, restaurant };
}

const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
    name: "credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null;

      await connectDB();
      const user = await User.findOne({ email: credentials.email.toLowerCase() });
      if (!user?.passwordHash) return null;

      const valid = await bcrypt.compare(credentials.password, user.passwordHash);
      if (!valid) return null;

      const restaurant = await resolveRestaurantForUser(user);

      return {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        restaurantId: restaurant?._id.toString() ?? "",
        restaurantName: restaurant?.name ?? "My Diner",
      };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers,
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (trigger === "update" && session) {
        const patch = session as {
          restaurantName?: string;
          kitchenNameSet?: boolean;
          restaurantId?: string;
          name?: string;
        };
        if (patch.restaurantName) token.restaurantName = patch.restaurantName;
        if (patch.kitchenNameSet != null) token.kitchenNameSet = patch.kitchenNameSet;
        if (patch.restaurantId) token.restaurantId = patch.restaurantId;
        if (patch.name) token.name = patch.name;
        return token;
      }

      if (user) {
        await connectDB();
        const email = user.email ?? token.email;
        if (email) {
          const ensured = await ensureUserAndRestaurant({
            email,
            name: user.name ?? token.name,
          });
          token.sub = ensured.user._id.toString();
          token.restaurantId = ensured.restaurant._id.toString();
          token.restaurantName = ensured.restaurant.name;
          token.kitchenNameSet = Boolean(ensured.restaurant.kitchenNameSet);
          token.name = ensured.user.name;
          token.email = ensured.user.email;
        } else {
          token.restaurantId = (user as { restaurantId?: string }).restaurantId;
          token.restaurantName = (user as { restaurantName?: string }).restaurantName;
        }
      } else if (token.sub) {
        await connectDB();
        const stale = !(await User.findById(token.sub as string));
        if (stale && token.email) {
          try {
            const healedUser = await resolveSessionUser({
              id: token.sub as string,
              email: token.email as string,
              name: (token.name as string) || undefined,
            });
            const restaurant = await ensureRestaurantForUser(healedUser._id.toString());
            token.sub = healedUser._id.toString();
            token.restaurantId = restaurant._id.toString();
            token.restaurantName = restaurant.name;
            token.kitchenNameSet = Boolean(restaurant.kitchenNameSet);
            token.name = healedUser.name;
          } catch {
            /* leave token as-is; API routes will return 401 */
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = token.name as string;
        (session.user as { id?: string }).id = token.sub;
        (session.user as { restaurantId?: string }).restaurantId =
          token.restaurantId as string;
        (session.user as { restaurantName?: string }).restaurantName =
          token.restaurantName as string;
        (session.user as { kitchenNameSet?: boolean }).kitchenNameSet =
          token.kitchenNameSet as boolean;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
