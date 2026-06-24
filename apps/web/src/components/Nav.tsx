"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  BookOpen,
  LayoutDashboard,
  Loader2,
  LogOut,
  Pencil,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { useKitchenName } from "@/components/KitchenNameProvider";
import { useOrderWorkOptional } from "@/components/OrderWorkProvider";
import { Tooltip } from "@/components/ui/Tooltip";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, hint: "Inventory, sales, and creative assistants" },
  { href: "/upload-orders", label: "Upload orders", icon: Upload, hint: "Purchase and sales order uploads" },
  { href: "/kitchen-control", label: "Kitchen control", icon: SlidersHorizontal, hint: "Pantry, menu, and catalog" },
  { href: "/recipes", label: "Recipes", icon: BookOpen, hint: "Active, suggested, and inactive dishes" },
] as const;

function navLinkClass(active: boolean) {
  return `sc-nav-link ${
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
    <header className="fixed inset-x-0 top-0 z-50 border-b border-chef-border bg-chef-surface/95 shadow-[0_1px_2px_rgba(42,38,34,0.04)] backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-col sm:flex-row sm:items-center sm:gap-3">
          <Link
            href="/dashboard"
            className="text-lg font-semibold tracking-tight text-chef-sage transition hover:text-chef-sage-dark"
          >
            Sous Chef
          </Link>
          {kitchenNameSet && kitchenName ? (
            <Tooltip content="Edit kitchen name">
              <button
                type="button"
                onClick={openEditKitchenName}
                className="group flex min-w-0 max-w-[14rem] items-center gap-1.5 truncate text-left text-sm text-chef-text-muted transition hover:text-chef-text"
              >
                <span className="truncate">{kitchenName}</span>
                <Pencil className="h-3.5 w-3.5 shrink-0 opacity-0 transition group-hover:opacity-70" aria-hidden />
              </button>
            </Tooltip>
          ) : null}
        </div>
        <nav className="flex flex-wrap items-center gap-1" aria-label="Main">
          {orderWorkActive && (
            <span
              className="mr-1 hidden items-center gap-1.5 text-sm text-chef-amber sm:inline-flex"
              role="status"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {orderWorkLabel}
            </span>
          )}
          {links.map((link) => {
            const active = isActive(link.href);
            const Icon = link.icon;
            return (
              <Tooltip key={link.href} content={link.hint}>
                <Link href={link.href} className={navLinkClass(active)} aria-current={active ? "page" : undefined}>
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="hidden sm:inline">{link.label}</span>
                </Link>
              </Tooltip>
            );
          })}
          <Tooltip content="Sign out of your account">
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="sc-nav-link text-chef-text-muted hover:bg-chef-muted hover:text-chef-text"
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </Tooltip>
        </nav>
      </div>
    </header>
  );
}
