"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type NavigationGuardContextValue = {
  blocked: boolean;
  reason: string;
  setNavigationBlocked: (blocked: boolean, reason?: string) => void;
};

const NavigationGuardContext = createContext<NavigationGuardContextValue | null>(null);

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const [blocked, setBlocked] = useState(false);
  const [reason, setReason] = useState("");

  const setNavigationBlocked = useCallback((next: boolean, nextReason = "") => {
    setBlocked(next);
    setReason(nextReason);
  }, []);

  const value = useMemo(
    () => ({ blocked, reason, setNavigationBlocked }),
    [blocked, reason, setNavigationBlocked]
  );

  return (
    <NavigationGuardContext.Provider value={value}>{children}</NavigationGuardContext.Provider>
  );
}

export function useNavigationGuard() {
  const ctx = useContext(NavigationGuardContext);
  if (!ctx) {
    throw new Error("useNavigationGuard must be used within NavigationGuardProvider");
  }
  return ctx;
}

/** Optional hook for components outside strict provider needs — returns inert no-op if missing */
export function useNavigationGuardOptional() {
  return useContext(NavigationGuardContext);
}
