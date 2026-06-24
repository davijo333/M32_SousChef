"use client";

import { Nav } from "@/components/Nav";
import { CatalogEmptyPrompt } from "@/components/CatalogEmptyPrompt";
import { useKitchenCatalog } from "@/lib/use-kitchen-catalog";

export default function RecipesPage() {
  const { data, loading, hasCatalog } = useKitchenCatalog();

  if (loading || !data) {
    return (
      <>
        <Nav />
        <p className="p-8 text-chef-text-muted">Loading recipes…</p>
      </>
    );
  }

  const ingBySlug = new Map(data.ingredients.map((i) => [i.slug, i]));
  const withRecipes = data.menuItems.filter((item) => item.ingredientLinks?.length);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-chef-text">Recipes</h1>
        <p className="mt-1 text-base text-chef-text-muted">
          How each menu item uses your ingredients — from your kitchen catalog.
        </p>

        {!hasCatalog && (
          <CatalogEmptyPrompt
            title="Add menu items and ingredients first"
            description="Recipes appear after you upload bills and add items to your kitchen, or load the Sunrise Diner demo from the dashboard."
          />
        )}

        {hasCatalog && withRecipes.length === 0 && (
          <p className="mt-6 text-sm text-chef-text-muted">
            Your menu items do not have ingredient links yet. Load the demo kitchen or link
            ingredients in Kitchen when that is available.
          </p>
        )}

        {hasCatalog && withRecipes.length > 0 && (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {withRecipes.map((item) => (
              <article key={item.slug} className="sc-card p-5">
                <h2 className="font-semibold text-chef-text">{item.name}</h2>
                <p className="mt-1 text-sm text-chef-text-muted">
                  ${item.sellPrice.toFixed(2)} · {item.category.replace(/_/g, " ")}
                </p>
                <ul className="mt-3 space-y-1.5 text-sm text-chef-text">
                  {(item.ingredientLinks ?? []).map((link) => {
                    const ing = ingBySlug.get(link.ingredientSlug);
                    return (
                      <li key={`${item.slug}-${link.ingredientSlug}`} className="rounded-lg bg-chef-muted/60 px-3 py-2">
                        {link.qtyPerServing} {link.unit}{" "}
                        {ing?.name ?? link.ingredientSlug.replace(/^ing-/, "").replace(/-/g, " ")}
                      </li>
                    );
                  })}
                </ul>
              </article>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
