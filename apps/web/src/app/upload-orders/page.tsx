"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Nav } from "@/components/Nav";
import { useNavigationGuard } from "@/components/NavigationGuardProvider";
import { BillUploadZone, type SavedBill } from "@/components/BillUploadZone";
import { PurchaseOrderTable } from "@/components/PurchaseOrderTable";
import { useNewCatalogReview } from "@/lib/use-new-catalog-review";

type SessionPayload = {
  supplier: SavedBill[];
  confirmedBillIds: string[];
};

export default function UploadOrdersPage() {
  const router = useRouter();
  const { status: authStatus } = useSession();
  const { setNavigationBlocked } = useNavigationGuard();

  const [pendingBills, setPendingBills] = useState<SavedBill[]>([]);
  const [processedBillIds, setProcessedBillIds] = useState<string[]>([]);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [poTableKey, setPoTableKey] = useState(0);

  const loadSession = useCallback(async () => {
    const res = await fetch("/api/bills/session");
    if (!res.ok) return;
    const data = (await res.json()) as SessionPayload;
    setPendingBills((data.supplier ?? []).filter((b) => b.status !== "confirmed"));
    setProcessedBillIds(data.confirmedBillIds ?? []);
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
  }, [authStatus, loadSession]);

  const { handleBillsConfirmed, handleBillRemoved, handleBillsProcessed, discoverItems } =
    useNewCatalogReview();

  useEffect(() => {
    if (parsing) {
      setNavigationBlocked(true, "Uploading or processing orders…");
    } else {
      setNavigationBlocked(false);
    }
    return () => setNavigationBlocked(false);
  }, [parsing, setNavigationBlocked]);

  useEffect(() => {
    if (!parsing) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [parsing]);

  function handleProcessed(billIds: string[]) {
    setProcessedBillIds((prev) => Array.from(new Set([...prev, ...billIds])));
    setPoTableKey((k) => k + 1);
    void loadSession();
  }

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
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <header className="max-w-3xl">
          <h1 className="text-2xl font-semibold text-chef-text sm:text-3xl">Purchase orders</h1>
          <p className="mt-2 text-base leading-relaxed text-chef-text-muted">
            Upload wholesaler invoices (PDF or PNG), then Process to add or update ingredients. New
            items with photos appear on{" "}
            {parsing ? (
              <span className="font-medium text-chef-text-muted">Kitchen control</span>
            ) : (
              <Link href="/kitchen-control" className="font-medium text-chef-sage underline">
                Kitchen control
              </Link>
            )}{" "}
            during upload.
          </p>
        </header>

        {sessionLoading && (
          <p className="mt-4 text-sm text-chef-text-muted">Loading…</p>
        )}

        {parsing && (
          <p className="mt-4 text-sm text-chef-text-muted" role="status" aria-live="polite">
            Uploading purchase orders… you can Process ready files while others finish.
          </p>
        )}

        <section className="mt-5">
          <BillUploadZone
            billType="supplier"
            title="Upload purchase orders"
            description="Wholesaler invoices (.s_bill.) — up to 5 at a time, then Process."
            stagingOnly
            onBillsConfirmed={(items, billIds) => {
              handleBillsConfirmed(items, billIds);
              handleBillsProcessed(billIds);
            }}
            onProcessed={handleProcessed}
            onNewItemsDiscovered={(items) => discoverItems({ ingredients: items.ingredients })}
            onBillRemoved={(id) => handleBillRemoved([id])}
            onProcessingChange={setParsing}
            processedBillIds={processedBillIds}
            initialBills={pendingBills}
          />
        </section>

        <PurchaseOrderTable refreshKey={poTableKey} />
      </main>
    </>
  );
}
