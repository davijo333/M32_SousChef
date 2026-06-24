"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ExternalLink, Loader2, Package } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";

export type PurchaseOrderRow = {
  poId: string;
  filename: string;
  storeName?: string;
  vendor?: string;
  purchaseDate: string | null;
  uploadDate: string;
  status: string;
  billUploadId: string;
  items: Array<{ name: string; price: number; qty: number; unit?: string }>;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

type Props = {
  refreshKey?: number;
};

export function PurchaseOrderTable({ refreshKey = 0 }: Props) {
  const [orders, setOrders] = useState<PurchaseOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setAuthError(false);
    try {
      const res = await fetch("/api/purchase-orders?status=processed");
      if (res.status === 401) {
        setAuthError(true);
        setOrders([]);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setOrders(data.orders ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  function toggleRow(poId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(poId)) next.delete(poId);
      else next.add(poId);
      return next;
    });
  }

  return (
    <section className="mt-8">
      <h2 className="sc-section-title">Processed purchase orders</h2>
      <p className="mt-1 text-sm text-chef-text-muted">
        Orders appear here after you click Process. Upload new files above anytime.
      </p>

      {loading && (
        <p className="mt-4 flex items-center gap-2 text-sm text-chef-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading purchase orders…
        </p>
      )}

      {authError && !loading && (
        <p className="mt-4 text-sm text-red-700">
          Sign in to view your purchase orders.{" "}
          <Link href="/login?callbackUrl=/upload-orders" className="underline">
            Log in
          </Link>
        </p>
      )}

      {!loading && !authError && orders.length === 0 && (
        <div className="sc-empty-state">
          <Package className="mx-auto h-8 w-8 text-chef-text-muted/50" aria-hidden />
          <p className="mt-3">No processed orders yet.</p>
          <p className="mt-1 text-xs">Upload files above, then click Process.</p>
        </div>
      )}

      {!loading && orders.length > 0 && (
        <div className="sc-table-wrap">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-chef-border bg-chef-muted/60 text-chef-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">PO ID</th>
                <th className="px-4 py-3 font-medium">Store</th>
                <th className="px-4 py-3 font-medium">Filename</th>
                <th className="px-4 py-3 font-medium">Purchase date</th>
                <th className="px-4 py-3 font-medium">Upload date</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {orders.map((po) => {
                const isOpen = expanded.has(po.poId);
                const storeLabel = po.storeName ?? po.vendor ?? "—";
                return (
                  <Fragment key={po.poId}>
                    <tr className="border-b border-chef-border transition-colors hover:bg-chef-muted/30">
                      <td className="px-4 py-3 font-mono text-xs font-medium text-chef-text">
                        {po.poId}
                      </td>
                      <td className="max-w-[8rem] truncate px-4 py-3 text-chef-text-muted">
                        <Tooltip content={storeLabel}>
                          <span className="block truncate">{storeLabel}</span>
                        </Tooltip>
                      </td>
                      <td className="max-w-[12rem] truncate px-4 py-3 text-chef-text">
                        <Tooltip content={po.filename}>
                          <span className="block truncate">{po.filename}</span>
                        </Tooltip>
                      </td>
                      <td className="px-4 py-3 text-chef-text-muted">
                        {formatDate(po.purchaseDate)}
                      </td>
                      <td className="px-4 py-3 text-chef-text-muted">{formatDate(po.uploadDate)}</td>
                      <td className="px-4 py-3 text-chef-text-muted">
                        {po.items.length} item{po.items.length !== 1 ? "s" : ""}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Tooltip content={isOpen ? "Hide line items" : "View line items"}>
                          <button
                            type="button"
                            onClick={() => toggleRow(po.poId)}
                            className="sc-icon-btn text-chef-sage hover:text-chef-sage-dark"
                            aria-expanded={isOpen}
                            aria-label={isOpen ? `Hide ${po.poId}` : `View ${po.poId}`}
                          >
                            {isOpen ? (
                              <ChevronUp className="h-4 w-4" aria-hidden />
                            ) : (
                              <ChevronDown className="h-4 w-4" aria-hidden />
                            )}
                          </button>
                        </Tooltip>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-chef-border bg-chef-muted/40">
                        <td colSpan={7} className="px-4 py-3">
                          <table className="w-full text-sm">
                            <thead className="text-chef-text-muted">
                              <tr>
                                <th className="py-1 pr-4 text-left font-medium">Name</th>
                                <th className="py-1 pr-4 text-left font-medium">Price</th>
                                <th className="py-1 text-left font-medium">Qty</th>
                              </tr>
                            </thead>
                            <tbody>
                              {po.items.map((item, i) => (
                                <tr
                                  key={`${po.poId}-${i}`}
                                  className="border-t border-chef-border/60"
                                >
                                  <td className="py-1.5 pr-4 text-chef-text">{item.name}</td>
                                  <td className="py-1.5 pr-4 text-chef-text-muted">
                                    {formatMoney(item.price)}
                                  </td>
                                  <td className="py-1.5 text-chef-text-muted">
                                    {item.qty}
                                    {item.unit ? ` ${item.unit}` : ""}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {po.vendor && (
                            <p className="mt-2 text-xs text-chef-text-muted">
                              Store: {po.storeName ?? po.vendor}
                            </p>
                          )}
                          <a
                            href={`/api/bills/${po.billUploadId}/file`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-xs text-chef-sage underline"
                          >
                            <ExternalLink className="h-3 w-3" aria-hidden />
                            View original file
                          </a>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
