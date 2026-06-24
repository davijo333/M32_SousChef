"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useKitchenName } from "@/components/KitchenNameProvider";
import { useOrderWorkOptional } from "@/components/OrderWorkProvider";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/upload-orders", label: "Upload orders" },
  { href: "/kitchen-control", label: "Kitchen control" },
  { href: "/recipes", label: "Recipes" },
];

function enabledNavClass(active: boolean) {
  return `rounded-lg px-3 py-2 text-base transition ${
    active
      ? "bg-chef-sage-light font-semibold text-chef-sage-dark"
      : "text-chef-text-muted hover:bg-chef-muted hover:text-chef-text"
  }`;
}

export function Nav() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const orderWork = useOrderWorkOptional();
  const { openEditKitchenName, restaurant } = useKitchenName();
  const orderWorkActive = orderWork?.anyBusy ?? false;

  if (!session) return null;

  const sessionKitchenNameSet = (session.user as { kitchenNameSet?: boolean }).kitchenNameSet;
  const sessionRestaurantName = (session.user as { restaurantName?: string }).restaurantName;
  const kitchenNameSet = restaurant?.kitchenNameSet ?? sessionKitchenNameSet;
  const kitchenName =
    restaurant?.kitchenNameSet && restaurant.name
      ? restaurant.name
      : sessionKitchenNameSet
        ? sessionRestaurantName
        : null;

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const orderWorkLabel =
    orderWork?.supplierBusy && orderWork.getStoredEntries("supplier").some((e) => e.status === "processing")
      ? "Purchase orders processing…"
      : orderWork?.customerBusy && orderWork.getStoredEntries("customer").some((e) => e.status === "processing")
        ? "Sales orders processing…"
        : orderWork?.supplierBusy
          ? "Purchase orders uploading…"
          : orderWork?.customerBusy
            ? "Sales orders uploading…"
            : "Orders processing…";

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-chef-border bg-chef-surface/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3.5">
        <div className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-3">
          <Link href="/dashboard" className="text-xl font-semibold text-chef-sage">
            Sous Chef
          </Link>
          {kitchenNameSet && kitchenName ? (
            <button
              type="button"
              onClick={openEditKitchenName}
              className="truncate text-left text-sm text-chef-text-muted hover:text-chef-text"
              title="Edit kitchen name"
            >
              {kitchenName}
            </button>
          ) : null}
        </div>
        <nav className="flex flex-wrap items-center gap-1 sm:gap-2" aria-label="Main">
          {orderWorkActive && (
            <span className="hidden text-sm text-chef-amber sm:inline" role="status">
              {orderWorkLabel}
            </span>
          )}
          {links.map((link) => {
            const active = isActive(link.href);
            return (
              <Link key={link.href} href={link.href} className={enabledNavClass(active)}>
                {link.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded-lg px-3 py-2 text-base text-chef-text-muted hover:bg-chef-muted hover:text-chef-text"
          >
            Log out
          </button>
        </nav>
      </div>
    </header>
  );
}
