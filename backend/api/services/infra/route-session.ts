import { getToken } from "next-auth/jwt";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@backend/services/infra/auth";

export type RouteSessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  restaurantId?: string;
  restaurantName?: string;
};

/** Resolve the signed-in user in App Router route handlers (GET/POST/DELETE). */
export async function getRouteSession(req?: Request): Promise<{ user: RouteSessionUser } | null> {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as
    | { id?: string; restaurantId?: string; restaurantName?: string }
    | undefined;
  if (sessionUser?.id) {
    return {
      user: {
        id: sessionUser.id,
        name: session?.user?.name,
        email: session?.user?.email,
        restaurantId: sessionUser.restaurantId,
        restaurantName: sessionUser.restaurantName,
      },
    };
  }

  const token = await getToken({
    req: req as Parameters<typeof getToken>[0]["req"],
    secret: authOptions.secret,
  });
  if (!token?.sub) return null;

  return {
    user: {
      id: String(token.sub),
      name: (token.name as string | undefined) ?? session?.user?.name,
      email: (token.email as string | undefined) ?? session?.user?.email,
      restaurantId: token.restaurantId as string | undefined,
      restaurantName: token.restaurantName as string | undefined,
    },
  };
}
