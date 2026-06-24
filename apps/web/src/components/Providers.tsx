"use client";

import { SessionProvider } from "next-auth/react";
import { KitchenNameProvider } from "@/components/KitchenNameProvider";
import { NavigationGuardProvider } from "@/components/NavigationGuardProvider";
import { OrderWorkProvider } from "@/components/OrderWorkProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <NavigationGuardProvider>
        <OrderWorkProvider>
          <KitchenNameProvider>{children}</KitchenNameProvider>
        </OrderWorkProvider>
      </NavigationGuardProvider>
    </SessionProvider>
  );
}
