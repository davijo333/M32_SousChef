"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Nav } from "@/components/Nav";
import { useOrderWork } from "@/components/OrderWorkProvider";
import { BillUploadZone, type SavedBill } from "@/components/BillUploadZone";
import { PurchaseOrderTable } from "@/components/PurchaseOrderTable";
import { SalesOrderTable } from "@/components/SalesOrderTable";
import { useNewCatalogReview } from "@/lib/use-new-catalog-review";

type OrderTab = "purchase" | "sales";

type SessionPayload = {
  supplier: SavedBill[];
  customer: SavedBill[];
  confirmedBillIds: string[];
};

const TABS: { id: OrderTab; label: string }[] = [
  { id: "purchase", label: "Purchase orders" },
  { id: "sales", label: "Sales orders" },
];

function tabClass(active: boolean) {
  return `rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition ${
    active
      ? "border-chef-sage bg-chef-surface text-chef-sage"
      : "border-transparent text-chef-text-muted hover:border-chef-border hover:text-chef-text"
  }`;
}

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
        <p className="p-8 text-chef-text-muted">Loading…</p>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="sc-main-with-nav mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <header className="max-w-3xl">
          <h1 className="text-2xl font-semibold text-chef-text sm:text-3xl">Upload orders</h1>
          <ul className="mt-3 space-y-1.5 text-base leading-relaxed text-chef-text-muted">
            <li>Update inventory using purchase orders.</li>
            <li>Capture dishes from sales orders.</li>
            <li>New dishes trigger the Recipe Agent.</li>
          </ul>
          <p className="mt-3 text-sm text-chef-text-muted">
            <span className="font-medium text-chef-text">Suggestion:</span> Process purchase orders
            first so recipes link to your pantry on{" "}
            <Link href="/kitchen-control" className="font-medium text-chef-sage underline">
              Kitchen control
            </Link>
            .
          </p>
        </header>

        {sessionLoading && (
          <p className="mt-4 text-sm text-chef-text-muted">Loading…</p>
        )}

        {orderWorkInProgress && (
          <p className="mt-4 text-sm text-chef-amber" role="status" aria-live="polite">
            Upload or processing in progress — continues in the background if you open Dashboard,
            Kitchen control, or Recipes. Stay on this sub-tab to add more files.
          </p>
        )}

        <div className="mt-6 border-b border-chef-border">
          <div className="flex gap-1" role="tablist" aria-label="Order type">
            {TABS.map((tab) => {
              const pending =
                tab.id === "purchase" ? pendingPurchaseCount : pendingSalesCount;
              const busy = tab.id === "purchase" ? supplierBusy : customerBusy;
              const tabLocked = orderWorkInProgress && activeTab !== tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`panel-${tab.id}`}
                  aria-disabled={tabLocked}
                  id={`tab-${tab.id}`}
                  disabled={tabLocked}
                  onClick={() => setActiveTab(tab.id)}
                  title={
                    tabLocked
                      ? "Wait for the current upload or processing to finish before switching tabs"
                      : undefined
                  }
                  className={`${tabClass(activeTab === tab.id)} ${
                    tabLocked ? "cursor-not-allowed opacity-50" : ""
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {tab.label}
                    {pending > 0 && (
                      <span className="rounded-full bg-chef-sage/15 px-2 py-0.5 text-xs font-semibold text-chef-sage">
                        {pending}
                      </span>
                    )}
                    {busy && (
                      <span className="text-xs text-chef-text-muted" aria-label="Upload in progress">
                        …
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
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
