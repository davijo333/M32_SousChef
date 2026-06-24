"use client";

import { SessionProvider } from "next-auth/react";
import { KitchenNameProvider } from "@/components/KitchenNameProvider";
import { NavigationGuardProvider } from "@/components/NavigationGuardProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <NavigationGuardProvider>
        <KitchenNameProvider>{children}</KitchenNameProvider>
      </NavigationGuardProvider>
    </SessionProvider>
  );
}
