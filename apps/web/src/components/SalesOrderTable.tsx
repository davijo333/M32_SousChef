"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Receipt } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";

export type SalesOrderRow = {
  soId: string;
  filename: string;
  vendor?: string;
  saleDate: string | null;
  uploadDate: string;
  status: string;
  billUploadId: string;
  items: Array<{
    name: string;
    price: number;
    qty: number;
    unit?: string;
    itemKind: "dish" | "addon";
  }>;
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

export function SalesOrderTable({ refreshKey = 0 }: Props) {
  const [orders, setOrders] = useState<SalesOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setAuthError(false);
    try {
      const res = await fetch("/api/sales-orders?status=processed");
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

  function toggleRow(soId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(soId)) next.delete(soId);
      else next.add(soId);
      return next;
    });
  }

  return (
    <section className="mt-8">
      <h2 className="sc-section-title">Processed sales orders</h2>
      <p className="mt-1 text-sm text-chef-text-muted">
        Customer receipts appear here after you click Process.
      </p>

      {loading && (
        <p className="mt-4 flex items-center gap-2 text-sm text-chef-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading sales orders…
        </p>
      )}

      {authError && (
        <p className="mt-4 text-sm text-chef-amber">Sign in to view sales orders.</p>
      )}

      {!loading && !authError && orders.length === 0 && (
        <div className="sc-empty-state">
          <Receipt className="mx-auto h-8 w-8 text-chef-text-muted/50" aria-hidden />
          <p className="mt-3">No processed sales orders yet.</p>
          <p className="mt-1 text-xs">Upload receipts above, then click Process.</p>
        </div>
      )}

      {!loading && orders.length > 0 && (
        <div className="sc-table-wrap">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-chef-border bg-chef-muted/60 text-chef-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">File</th>
                <th className="px-4 py-3 font-medium">Sale date</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const isOpen = expanded.has(order.soId);
                const dishCount = order.items.filter((i) => i.itemKind === "dish").length;
                const addonCount = order.items.filter((i) => i.itemKind === "addon").length;
                return (
                  <Fragment key={order.soId}>
                    <tr className="border-b border-chef-border transition-colors hover:bg-chef-muted/30">
                      <td className="px-4 py-3 font-mono text-xs font-medium text-chef-text">
                        {order.soId}
                      </td>
                      <td className="max-w-[12rem] truncate px-4 py-3 text-chef-text-muted">
                        <Tooltip content={order.filename}>
                          <span className="block truncate">{order.filename}</span>
                        </Tooltip>
                      </td>
                      <td className="px-4 py-3 text-chef-text-muted">
                        {formatDate(order.saleDate)}
                      </td>
                      <td className="px-4 py-3 text-chef-text-muted">
                        {dishCount} dish{dishCount === 1 ? "" : "es"}
                        {addonCount > 0 ? `, ${addonCount} add-on${addonCount === 1 ? "" : "s"}` : ""}
                      </td>
                      <td className="px-4 py-3">
                        <span className="sc-badge-sage capitalize">{order.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Tooltip content={isOpen ? "Hide line items" : "View line items"}>
                          <button
                            type="button"
                            onClick={() => toggleRow(order.soId)}
                            className="sc-icon-btn text-chef-sage hover:text-chef-sage-dark"
                            aria-expanded={isOpen}
                            aria-label={isOpen ? `Hide ${order.soId}` : `View ${order.soId}`}
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
                        <td colSpan={6} className="px-4 py-3">
                          <ul className="space-y-1 text-sm">
                            {order.items.map((item, idx) => (
                              <li key={`${order.soId}-${idx}`} className="flex justify-between gap-4">
                                <span>
                                  <span className="sc-badge-muted mr-2 uppercase">{item.itemKind}</span>
                                  {item.name}
                                </span>
                                <span className="shrink-0 text-chef-text-muted">
                                  {item.qty} × {formatMoney(item.price)}
                                </span>
                              </li>
                            ))}
                          </ul>
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
