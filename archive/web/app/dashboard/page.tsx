"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DashboardChat } from "@/components/DashboardChat";
import { Nav } from "@/components/Nav";
import { useKitchenName } from "@/components/KitchenNameProvider";

type DashboardData = {
  restaurant: { name: string; isSeeded: boolean };
  counts: { ingredients: number; menuItems: number; expiring: number; lowStock: number };
  expiring: Array<{ name: string; currentQty: number; inventoryUnit: string; expiryDate: string }>;
  lowStock: Array<{ name: string; currentQty: number; reorderThreshold: number; inventoryUnit: string }>;
};

export default function DashboardPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { openEditKitchenName, restaurant: kitchenProfile } = useKitchenName();
  const [data, setData] = useState<DashboardData | null>(null);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/dashboard");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (!res.ok) return;
    const payload = (await res.json()) as DashboardData;
    setData({
      restaurant: payload.restaurant ?? { name: "Your kitchen", isSeeded: false },
      counts: payload.counts ?? {
        ingredients: 0,
        menuItems: 0,
        expiring: 0,
        lowStock: 0,
      },
      expiring: payload.expiring ?? [],
      lowStock: payload.lowStock ?? [],
    });
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadDemo() {
    setSeeding(true);
    await fetch("/api/seed", { method: "POST" });
    setSeeding(false);
    await load();
  }

  if (!data) {
    return (
      <>
        <Nav />
        <p className="p-8 text-stone-600">Loading…</p>
      </>
    );
  }

  const restaurant = data.restaurant ?? { name: "Your kitchen", isSeeded: false };
  const displayKitchenName =
    kitchenProfile?.kitchenNameSet ? kitchenProfile.name : restaurant.name;
  const counts = data.counts ?? {
    ingredients: 0,
    menuItems: 0,
    expiring: 0,
    lowStock: 0,
  };

  const empty =
    !restaurant.isSeeded &&
    counts.ingredients === 0 &&
    counts.menuItems === 0;
  const chefName = session?.user?.name ?? "Chef";

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8 pb-44">
        <h1 className="text-2xl font-semibold">Good morning, Chef {chefName}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-stone-600">{displayKitchenName}</p>
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
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="font-medium">Get started</h2>
            <p className="mt-1 text-stone-600">
              Upload a supplier bill — or load the Sunrise Diner demo, then ask Sous Chef below.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                onClick={loadDemo}
                disabled={seeding}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-800 disabled:opacity-50"
              >
                {seeding ? "Loading demo…" : "Load Sunrise Diner demo"}
              </button>
              <Link
                href="/upload-bills"
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm hover:bg-white"
              >
                Upload bills
              </Link>
            </div>
          </div>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-4">
          {[
            { label: "Ingredients", value: counts.ingredients },
            { label: "Menu items", value: counts.menuItems },
            { label: "Expiring soon", value: counts.expiring },
            { label: "Low stock", value: counts.lowStock },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-stone-200 bg-white p-4">
              <p className="text-sm text-stone-500">{card.label}</p>
              <p className="mt-1 text-2xl font-semibold">{card.value}</p>
            </div>
          ))}
        </div>

        {(data.expiring ?? []).length > 0 && (
          <section className="mt-8">
            <h2 className="font-medium">Expiring in 48 hours</h2>
            <ul className="mt-2 space-y-1 text-sm text-stone-700">
              {(data.expiring ?? []).map((i) => (
                <li key={i.name}>
                  {i.name} — {i.currentQty} {i.inventoryUnit}
                </li>
              ))}
            </ul>
          </section>
        )}

        {(data.lowStock ?? []).length > 0 && (
          <section className="mt-6">
            <h2 className="font-medium">Low stock</h2>
            <ul className="mt-2 space-y-1 text-sm text-stone-700">
              {(data.lowStock ?? []).map((i) => (
                <li key={i.name}>
                  {i.name} — {i.currentQty} {i.inventoryUnit} (reorder at {i.reorderThreshold})
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <DashboardChat />
    </>
  );
}
