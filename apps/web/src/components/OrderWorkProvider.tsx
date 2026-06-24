"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ActiveUploadFile, StoredBillEntry } from "@/lib/order-work-entries";

export type OrderBillType = "supplier" | "customer";

type OrderWorkContextValue = {
  supplierBusy: boolean;
  customerBusy: boolean;
  anyBusy: boolean;
  startWork: (billType: OrderBillType) => void;
  endWork: (billType: OrderBillType) => void;
  getStoredEntries: (billType: OrderBillType) => StoredBillEntry[];
  setStoredEntries: (billType: OrderBillType, entries: StoredBillEntry[]) => void;
  trackActiveFile: (billType: OrderBillType, entryId: string, filename: string) => void;
  untrackActiveFile: (billType: OrderBillType, entryId: string) => void;
  getActiveFiles: (billType: OrderBillType) => ActiveUploadFile[];
  subscribeRefresh: (listener: () => void) => () => void;
};

const OrderWorkContext = createContext<OrderWorkContextValue | null>(null);

export function OrderWorkProvider({ children }: { children: ReactNode }) {
  const countsRef = useRef({ supplier: 0, customer: 0 });
  const entriesRef = useRef<{ supplier: StoredBillEntry[]; customer: StoredBillEntry[] }>({
    supplier: [],
    customer: [],
  });
  const activeFilesRef = useRef<{
    supplier: ActiveUploadFile[];
    customer: ActiveUploadFile[];
  }>({ supplier: [], customer: [] });
  const [supplierBusy, setSupplierBusy] = useState(false);
  const [customerBusy, setCustomerBusy] = useState(false);
  const listenersRef = useRef(new Set<() => void>());

  const syncBusy = useCallback(() => {
    setSupplierBusy(countsRef.current.supplier > 0);
    setCustomerBusy(countsRef.current.customer > 0);
  }, []);

  const notifyRefresh = useCallback(() => {
    listenersRef.current.forEach((fn) => fn());
  }, []);

  const notifySettled = useCallback(() => {
    if (countsRef.current.supplier > 0 || countsRef.current.customer > 0) return;
    notifyRefresh();
  }, [notifyRefresh]);

  const startWork = useCallback(
    (billType: OrderBillType) => {
      countsRef.current[billType] += 1;
      syncBusy();
    },
    [syncBusy]
  );

  const endWork = useCallback(
    (billType: OrderBillType) => {
      countsRef.current[billType] = Math.max(0, countsRef.current[billType] - 1);
      syncBusy();
      notifySettled();
    },
    [notifySettled, syncBusy]
  );

  const getStoredEntries = useCallback((billType: OrderBillType) => {
    return entriesRef.current[billType];
  }, []);

  const setStoredEntries = useCallback((billType: OrderBillType, entries: StoredBillEntry[]) => {
    entriesRef.current[billType] = entries;
  }, []);

  const trackActiveFile = useCallback(
    (billType: OrderBillType, entryId: string, filename: string) => {
      const list = activeFilesRef.current[billType];
      if (!list.some((f) => f.entryId === entryId)) {
        list.push({ entryId, filename });
      }
    },
    []
  );

  const untrackActiveFile = useCallback((billType: OrderBillType, entryId: string) => {
    activeFilesRef.current[billType] = activeFilesRef.current[billType].filter(
      (f) => f.entryId !== entryId
    );
  }, []);

  const getActiveFiles = useCallback((billType: OrderBillType) => {
    return activeFilesRef.current[billType];
  }, []);

  const subscribeRefresh = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const anyBusy = supplierBusy || customerBusy;

  useEffect(() => {
    if (!anyBusy) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [anyBusy]);

  useEffect(() => {
    if (!anyBusy) return;
    const id = window.setInterval(() => {
      notifyRefresh();
    }, 2500);
    return () => window.clearInterval(id);
  }, [anyBusy, notifyRefresh]);

  const value = useMemo(
    () => ({
      supplierBusy,
      customerBusy,
      anyBusy,
      startWork,
      endWork,
      getStoredEntries,
      setStoredEntries,
      trackActiveFile,
      untrackActiveFile,
      getActiveFiles,
      subscribeRefresh,
    }),
    [
      supplierBusy,
      customerBusy,
      anyBusy,
      startWork,
      endWork,
      getStoredEntries,
      setStoredEntries,
      trackActiveFile,
      untrackActiveFile,
      getActiveFiles,
      subscribeRefresh,
    ]
  );

  return <OrderWorkContext.Provider value={value}>{children}</OrderWorkContext.Provider>;
}

export function useOrderWork() {
  const ctx = useContext(OrderWorkContext);
  if (!ctx) {
    throw new Error("useOrderWork must be used within OrderWorkProvider");
  }
  return ctx;
}

export function useOrderWorkOptional() {
  return useContext(OrderWorkContext);
}
