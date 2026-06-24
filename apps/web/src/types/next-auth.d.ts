import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      email?: string | null;
      name?: string | null;
      restaurantId?: string;
      restaurantName?: string;
      kitchenNameSet?: boolean;
    };
  }

  interface User {
    restaurantId?: string;
    restaurantName?: string;
    kitchenNameSet?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    restaurantId?: string;
    restaurantName?: string;
    kitchenNameSet?: boolean;
  }
}
