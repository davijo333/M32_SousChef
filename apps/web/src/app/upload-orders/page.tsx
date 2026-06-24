"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, Receipt, ShoppingCart } from "lucide-react";
import { Nav } from "@/components/Nav";
import { useOrderWork } from "@/components/OrderWorkProvider";
import { BillUploadZone, type SavedBill } from "@/components/BillUploadZone";
import { PurchaseOrderTable } from "@/components/PurchaseOrderTable";
import { SalesOrderTable } from "@/components/SalesOrderTable";
import { Tooltip } from "@/components/ui/Tooltip";
import { useNewCatalogReview } from "@/lib/use-new-catalog-review";

type OrderTab = "purchase" | "sales";

type SessionPayload = {
  supplier: SavedBill[];
  customer: SavedBill[];
  confirmedBillIds: string[];
};

const TABS: { id: OrderTab; label: string; icon: typeof ShoppingCart; hint: string }[] = [
  { id: "purchase", label: "Purchase orders", icon: ShoppingCart, hint: "Wholesaler invoices — updates pantry stock" },
  { id: "sales", label: "Sales orders", icon: Receipt, hint: "POS receipts — records dishes sold" },
];

export default function UploadOrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status: authStatus } = useSession();

  const tabParam = searchParams.get("tab");
  const activeTab: OrderTab = tabParam === "sales" ? "sales" : "purchase";

  const [pendingSupplierBills, setPendingSupplierBills] = useState<SavedBill[]>([]);
  const [pendingCustomerBills, setPendingCustomerBills] = useState<SavedBill[]>([]);
  const [processedSupplierIds, setProcessedSupplierIds] = useState<string[]>([]);
  const [processedCustomerIds, setProcessedCustomerIds] = useState<string[]>([]);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [poTableKey, setPoTableKey] = useState(0);
  const [soTableKey, setSoTableKey] = useState(0);
  const [supplierHasProcessed, setSupplierHasProcessed] = useState(false);

  const { supplierBusy, customerBusy, anyBusy: orderWorkInProgress, subscribeRefresh } =
    useOrderWork();

  const replaceTab = useCallback(
    (tab: OrderTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "purchase") {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }
      const query = params.toString();
      router.replace(query ? `/upload-orders?${query}` : "/upload-orders", { scroll: false });
    },
    [router, searchParams]
  );

  function setActiveTab(tab: OrderTab) {
    if (orderWorkInProgress) return;
    replaceTab(tab);
  }

  const loadSession = useCallback(async () => {
    const res = await fetch("/api/bills/session");
    if (!res.ok) return;
    const data = (await res.json()) as SessionPayload;
    setPendingSupplierBills((data.supplier ?? []).filter((b) => b.status !== "confirmed"));
    setPendingCustomerBills((data.customer ?? []).filter((b) => b.status !== "confirmed"));
    const confirmed = data.confirmedBillIds ?? [];
    setProcessedSupplierIds(
      (data.supplier ?? []).filter((b) => confirmed.includes(b.billId)).map((b) => b.billId)
    );
    setProcessedCustomerIds(
      (data.customer ?? []).filter((b) => confirmed.includes(b.billId)).map((b) => b.billId)
    );
    setSupplierHasProcessed((data.supplier ?? []).some((b) => b.status === "confirmed"));
  }, []);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/login?callbackUrl=/upload-orders");
    }
  }, [authStatus, router]);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;
    (async () => {
      try {
        await loadSession();
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authStatus, loadSession, orderWorkInProgress]);

  const { handleBillsConfirmed, handleBillRemoved, handleBillsProcessed, discoverItems } =
    useNewCatalogReview();

  useEffect(() => {
    return subscribeRefresh(() => {
      if (orderWorkInProgress) return;
      void loadSession();
      setPoTableKey((k) => k + 1);
      setSoTableKey((k) => k + 1);
    });
  }, [subscribeRefresh, loadSession, orderWorkInProgress]);

  useEffect(() => {
    if (!orderWorkInProgress) return;
    const workTab: OrderTab = supplierBusy ? "purchase" : "sales";
    if (activeTab !== workTab) {
      replaceTab(workTab);
    }
  }, [orderWorkInProgress, supplierBusy, activeTab, replaceTab]);

  function handleSupplierProcessed(billIds: string[]) {
    setProcessedSupplierIds((prev) => Array.from(new Set([...prev, ...billIds])));
    setSupplierHasProcessed(true);
    setPoTableKey((k) => k + 1);
    void loadSession();
  }

  function handleCustomerProcessed(billIds: string[]) {
    setProcessedCustomerIds((prev) => Array.from(new Set([...prev, ...billIds])));
    setSoTableKey((k) => k + 1);
    void loadSession();
  }

  const pendingPurchaseCount = pendingSupplierBills.length;
  const pendingSalesCount = pendingCustomerBills.length;

  if (authStatus === "loading" || authStatus === "unauthenticated") {
    return (
      <>
        <Nav />
        <p className="sc-main-with-nav p-8 text-chef-text-muted">Loading…</p>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="sc-main-with-nav mx-auto max-w-6xl px-4 pb-8">
        <h1 className="text-2xl font-semibold text-chef-text sm:text-3xl">Upload orders</h1>
        <p className="mt-2 text-base text-chef-text-muted">
          Upload and process purchase orders and sales receipts.
        </p>

        {sessionLoading && (
          <p className="mt-4 text-sm text-chef-text-muted">Loading…</p>
        )}

        {orderWorkInProgress && (
          <div
            className="mt-6 flex items-center gap-3 rounded-xl border border-chef-sage/40 bg-chef-sage/10 px-4 py-4"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-chef-sage" aria-hidden />
            <p className="text-sm text-chef-text-muted">
              Upload or processing in progress — continues in the background on other pages. Stay on
              this tab to add more files.
            </p>
          </div>
        )}

        <div
          className="mt-6 flex flex-wrap gap-2 border-b border-chef-border pb-3"
          role="tablist"
          aria-label="Order type"
        >
          {TABS.map((tab) => {
            const pending = tab.id === "purchase" ? pendingPurchaseCount : pendingSalesCount;
            const busy = tab.id === "purchase" ? supplierBusy : customerBusy;
            const tabLocked = orderWorkInProgress && activeTab !== tab.id;
            const Icon = tab.icon;
            const tabButton = (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`panel-${tab.id}`}
                aria-disabled={tabLocked}
                id={`tab-${tab.id}`}
                disabled={tabLocked}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-chef-sage text-white"
                    : "bg-chef-muted text-chef-text-muted hover:text-chef-text"
                } ${tabLocked ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {tab.label}
                  {pending > 0 ? ` (${pending})` : ""}
                  {busy && (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin text-current opacity-80"
                      aria-label="Upload in progress"
                    />
                  )}
                </span>
              </button>
            );
            return tabLocked ? (
              <Tooltip key={tab.id} content="Finish the current upload before switching tabs">
                {tabButton}
              </Tooltip>
            ) : (
              <Tooltip key={tab.id} content={tab.hint}>
                {tabButton}
              </Tooltip>
            );
          })}
        </div>

        <div
          id="panel-purchase"
          role="tabpanel"
          aria-labelledby="tab-purchase"
          hidden={activeTab !== "purchase"}
          className={activeTab !== "purchase" ? "hidden" : "mt-6"}
        >
          <p className="text-sm text-chef-text-muted">
            Wholesaler invoices from Costco, Sysco, US Foods, etc. — PDF or PNG.
          </p>
          <div className="mt-4">
            <BillUploadZone
              billType="supplier"
              title="Upload purchase orders"
              description="Attach up to 10 PDF or PNG invoices — uploads one at a time, then click Process."
              stagingOnly
              uploadLocked={orderWorkInProgress}
              onBillsConfirmed={(items, billIds) => {
                handleBillsConfirmed(items);
                handleBillsProcessed(billIds);
              }}
              onProcessed={handleSupplierProcessed}
              onNewItemsDiscovered={(items) => discoverItems({ ingredients: items.ingredients })}
              onBillRemoved={(id) => handleBillRemoved([id])}
              processedBillIds={processedSupplierIds}
            />
          </div>
          <PurchaseOrderTable refreshKey={poTableKey} />
        </div>

        <div
          id="panel-sales"
          role="tabpanel"
          aria-labelledby="tab-sales"
          hidden={activeTab !== "sales"}
          className={activeTab !== "sales" ? "hidden" : "mt-6"}
        >
          <p className="text-sm text-chef-text-muted">
            Customer POS receipts — dishes and add-ons sold at your register.
          </p>
          <div className="mt-4">
            <BillUploadZone
              billType="customer"
              title="Upload sales orders"
              description="Attach up to 10 PDF or PNG receipts — uploads one at a time, then click Process."
              stagingOnly
              uploadLocked={orderWorkInProgress}
              requiresSupplierFirst
              supplierReady={supplierHasProcessed}
              onBillsConfirmed={(items, billIds) => {
                handleBillsConfirmed(items);
                handleBillsProcessed(billIds);
              }}
              onProcessed={handleCustomerProcessed}
              onBillRemoved={(id) => handleBillRemoved([id])}
              processedBillIds={processedCustomerIds}
            />
          </div>
          <SalesOrderTable refreshKey={soTableKey} />
        </div>
      </main>
    </>
  );
}
