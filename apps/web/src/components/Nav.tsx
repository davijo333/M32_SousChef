"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useNavigationGuardOptional } from "@/components/NavigationGuardProvider";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/upload-orders", label: "Upload orders" },
  { href: "/kitchen-control", label: "Kitchen control" },
];

function disabledNavClass(active: boolean) {
  return `rounded-lg px-3 py-2 text-base transition cursor-not-allowed opacity-45 ${
    active ? "bg-chef-sage-light/60 font-semibold text-chef-sage-dark" : "text-chef-text-muted"
  }`;
}

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
  const guard = useNavigationGuardOptional();
  const blocked = guard?.blocked ?? false;
  const blockReason = guard?.reason ?? "Please wait for the current operation to finish.";

  if (!session) return null;

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function navLocked(href: string) {
    return blocked && !isActive(href);
  }

  return (
    <header className="border-b border-chef-border bg-chef-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3.5">
        <div className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-3">
          {navLocked("/dashboard") ? (
            <span className="cursor-not-allowed text-xl font-semibold text-chef-sage/50" title={blockReason}>
              Sous Chef
            </span>
          ) : (
            <Link href="/dashboard" className="text-xl font-semibold text-chef-sage">
              Sous Chef
            </Link>
          )}
          {(session.user as { restaurantName?: string }).restaurantName && (
            <span className="truncate text-sm text-chef-text-muted">
              {(session.user as { restaurantName?: string }).restaurantName}
            </span>
          )}
        </div>
        <nav className="flex flex-wrap items-center gap-1 sm:gap-2" aria-label="Main">
          {blocked && (
            <span className="hidden text-sm text-chef-amber sm:inline" role="status">
              {blockReason}
            </span>
          )}
          {links.map((link) => {
            const active = isActive(link.href);
            const locked = navLocked(link.href);
            if (locked) {
              return (
                <span
                  key={link.href}
                  className={disabledNavClass(active)}
                  title={blockReason}
                  aria-disabled
                >
                  {link.label}
                </span>
              );
            }
            return (
              <Link key={link.href} href={link.href} className={enabledNavClass(active)}>
                {link.label}
              </Link>
            );
          })}
          <button
            type="button"
            disabled={blocked}
            onClick={() => {
              if (!blocked) signOut({ callbackUrl: "/login" });
            }}
            className={`rounded-lg px-3 py-2 text-base ${
              blocked
                ? "cursor-not-allowed text-chef-text-muted/50"
                : "text-chef-text-muted hover:bg-chef-muted hover:text-chef-text"
            }`}
            title={blocked ? blockReason : undefined}
          >
            Log out
          </button>
        </nav>
      </div>
    </header>
  );
}
