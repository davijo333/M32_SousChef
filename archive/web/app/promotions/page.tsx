"use client";

import { Nav } from "@/components/Nav";
import { CatalogEmptyPrompt } from "@/components/CatalogEmptyPrompt";
import { useKitchenCatalog } from "@/lib/use-kitchen-catalog";

function buildPromotionIdeas(
  expiring: { name: string; currentQty: number; inventoryUnit: string }[],
  lowStock: { name: string; currentQty: number; inventoryUnit: string }[],
  menuItems: { name: string }[]
): string[] {
  const ideas: string[] = [];

  for (const item of expiring) {
    ideas.push(
      `${item.name} special — use ${item.currentQty} ${item.inventoryUnit} before it expires`
    );
  }

  for (const item of lowStock.slice(0, 3)) {
    ideas.push(`Restock alert: ${item.name} is running low (${item.currentQty} ${item.inventoryUnit} left)`);
  }

  if (menuItems.length >= 2) {
    ideas.push(
      `Bundle idea: pair ${menuItems[0].name} with ${menuItems[1].name} for a breakfast combo`
    );
  } else if (menuItems.length === 1) {
    ideas.push(`Feature ${menuItems[0].name} as today's special`);
  }

  return ideas;
}

export default function PromotionsPage() {
  const { data, loading, hasCatalog } = useKitchenCatalog();

  if (loading || !data) {
    return (
      <>
        <Nav />
        <p className="p-8 text-chef-text-muted">Loading promotions…</p>
      </>
    );
  }

  const ideas = hasCatalog
    ? buildPromotionIdeas(data.expiring, data.lowStock, data.menuItems)
    : [];

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-chef-text">Promotions</h1>
        <p className="mt-1 text-base text-chef-text-muted">
          Ideas based on your real inventory and menu — not generic placeholders.
        </p>

        {!hasCatalog && (
          <CatalogEmptyPrompt
            title="Add menu items and ingredients first"
            description="Promotions use your stock levels and menu. Upload bills and add items to your kitchen, or load the Sunrise Diner demo from the dashboard."
          />
        )}

        {hasCatalog && (
          <section className="mt-6 sc-card p-5">
            <h2 className="font-semibold text-chef-text">Suggestions for {data.restaurant.name}</h2>
            {ideas.length === 0 ? (
              <p className="mt-3 text-sm text-chef-text-muted">
                No expiring or low-stock alerts right now. Upload supplier bills to track
                inventory, or check back after sales receipts update stock.
              </p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm text-chef-text">
                {ideas.map((idea) => (
                  <li key={idea} className="rounded-lg bg-chef-muted/60 px-3 py-2">
                    {idea}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </>
  );
}
