"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { useKitchenName } from "@/components/KitchenNameProvider";

type DashboardData = {
  restaurant: { name: string; isSeeded: boolean };
  counts: {
    ingredients: number;
    pendingBills: number;
    confirmedBills: number;
    expiring: number;
    lowStock: number;
  };
  expiring: Array<{ name: string; currentQty: number; inventoryUnit: string; expiryDate: string }>;
  lowStock: Array<{
    name: string;
    currentQty: number;
    reorderThreshold: number;
    inventoryUnit: string;
  }>;
};

export default function DashboardPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { openEditKitchenName, restaurant: kitchenProfile } = useKitchenName();
  const [data, setData] = useState<DashboardData | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/dashboard");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (!res.ok) return;
    setData(await res.json());
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) {
    return (
      <>
        <Nav />
        <p className="p-8 text-chef-text-muted">Loading dashboard…</p>
      </>
    );
  }

  const displayKitchenName =
    kitchenProfile?.kitchenNameSet ? kitchenProfile.name : data.restaurant.name;
  const chefName = session?.user?.name ?? "Chef";
  const empty = data.counts.ingredients === 0 && data.counts.confirmedBills === 0;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-chef-text">Good morning, Chef {chefName}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-chef-text-muted">{displayKitchenName}</p>
          {kitchenProfile?.kitchenNameSet && (
            <button
              type="button"
              onClick={openEditKitchenName}
              className="text-sm font-medium text-chef-sage underline"
            >
              Edit kitchen name
            </button>
          )}
        </div>

        {empty && (
          <div className="mt-6 rounded-xl border border-chef-amber/40 bg-chef-amber-light/50 p-6">
            <h2 className="font-medium text-chef-text">Get started</h2>
            <p className="mt-1 text-chef-text-muted">
              Upload purchase orders to build your ingredient pantry.
            </p>
            <Link href="/upload-orders" className="sc-btn-primary mt-4 inline-block py-2 text-sm">
              Upload purchase orders
            </Link>
          </div>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Ingredients", value: data.counts.ingredients },
            { label: "Orders to process", value: data.counts.pendingBills },
            { label: "Orders processed", value: data.counts.confirmedBills },
            { label: "Expiring soon", value: data.counts.expiring },
            { label: "Low stock", value: data.counts.lowStock },
          ].map((card) => (
            <div key={card.label} className="sc-card p-4">
              <p className="text-sm text-chef-text-muted">{card.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-chef-text">{card.value}</p>
            </div>
          ))}
        </div>

        {data.expiring.length > 0 && (
          <section className="mt-8">
            <h2 className="font-medium text-chef-text">Expiring in 48 hours</h2>
            <ul className="mt-2 space-y-1 text-sm text-chef-text-muted">
              {data.expiring.map((i) => (
                <li key={i.name}>
                  {i.name} — {i.currentQty} {i.inventoryUnit}
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.lowStock.length > 0 && (
          <section className="mt-6">
            <h2 className="font-medium text-chef-text">Low stock</h2>
            <ul className="mt-2 space-y-1 text-sm text-chef-text-muted">
              {data.lowStock.map((i) => (
                <li key={i.name}>
                  {i.name} — {i.currentQty} {i.inventoryUnit} (reorder at {i.reorderThreshold})
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/upload-orders" className="sc-btn-primary py-2 text-sm">
            Upload orders
          </Link>
          <Link
            href="/kitchen-control"
            className="rounded-lg border border-chef-border px-4 py-2 text-sm text-chef-text hover:bg-chef-muted"
          >
            Kitchen control
          </Link>
        </div>
      </main>
    </>
  );
}
