"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { KitchenNameModal } from "@/components/KitchenNameModal";

type RestaurantProfile = {
  name: string;
  kitchenNameSet: boolean;
};

type KitchenNameContextValue = {
  openEditKitchenName: () => void;
  refreshRestaurant: () => Promise<void>;
  restaurant: RestaurantProfile | null;
};

const KitchenNameContext = createContext<KitchenNameContextValue | null>(null);

export function useKitchenName() {
  const ctx = useContext(KitchenNameContext);
  if (!ctx) {
    throw new Error("useKitchenName must be used within KitchenNameProvider");
  }
  return ctx;
}

const PUBLIC_PATHS = new Set(["/login", "/signup"]);

export function KitchenNameProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status } = useSession();
  const [restaurant, setRestaurant] = useState<RestaurantProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const isPublic = PUBLIC_PATHS.has(pathname);

  const refreshRestaurant = useCallback(async () => {
    if (status !== "authenticated") return;
    try {
      const res = await fetch("/api/restaurant");
      if (!res.ok) return;
      const data = (await res.json()) as RestaurantProfile;
      setRestaurant(data);
    } finally {
      setLoaded(true);
    }
  }, [status]);

  useEffect(() => {
    if (status === "unauthenticated") {
      setRestaurant(null);
      setLoaded(false);
      return;
    }
    if (status === "authenticated" && !isPublic) {
      void refreshRestaurant();
    }
  }, [status, isPublic, refreshRestaurant]);

  const openEditKitchenName = useCallback(() => {
    setEditOpen(true);
  }, []);

  const needsSetup = status === "authenticated" && !isPublic && loaded && !restaurant?.kitchenNameSet;

  return (
    <KitchenNameContext.Provider
      value={{ openEditKitchenName, refreshRestaurant, restaurant }}
    >
      {children}

      <KitchenNameModal
        open={needsSetup || editOpen}
        required={needsSetup}
        initialName={
          restaurant?.kitchenNameSet ? restaurant.name : ""
        }
        onClose={needsSetup ? undefined : () => setEditOpen(false)}
        onSaved={(name) => {
          setRestaurant((prev) =>
            prev ? { ...prev, name, kitchenNameSet: true } : { name, kitchenNameSet: true }
          );
          setEditOpen(false);
          void refreshRestaurant();
        }}
      />
    </KitchenNameContext.Provider>
  );
}
