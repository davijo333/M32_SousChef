"use client";

import { Fragment, useCallback, useEffect, useState } from "react";

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
      <h2 className="text-lg font-semibold text-chef-text">Processed sales orders</h2>
      <p className="mt-1 text-sm text-chef-text-muted">
        Customer receipts appear here after you click Process.
      </p>

      {loading && (
        <p className="mt-4 text-sm text-chef-text-muted">Loading sales orders…</p>
      )}

      {authError && (
        <p className="mt-4 text-sm text-chef-amber">Sign in to view sales orders.</p>
      )}

      {!loading && !authError && orders.length === 0 && (
        <p className="mt-4 text-sm text-chef-text-muted">No processed sales orders yet.</p>
      )}

      {!loading && orders.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-chef-border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-chef-muted/60 text-chef-text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Order</th>
                <th className="px-3 py-2 font-medium">File</th>
                <th className="px-3 py-2 font-medium">Sale date</th>
                <th className="px-3 py-2 font-medium">Items</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const isOpen = expanded.has(order.soId);
                const dishCount = order.items.filter((i) => i.itemKind === "dish").length;
                const addonCount = order.items.filter((i) => i.itemKind === "addon").length;
                return (
                  <Fragment key={order.soId}>
                    <tr
                      className="cursor-pointer border-t border-chef-border hover:bg-chef-surface/60"
                      onClick={() => toggleRow(order.soId)}
                    >
                      <td className="px-3 py-2 font-medium text-chef-text">{order.soId}</td>
                      <td className="max-w-[12rem] truncate px-3 py-2 text-chef-text-muted">
                        {order.filename}
                      </td>
                      <td className="px-3 py-2 text-chef-text-muted">
                        {formatDate(order.saleDate)}
                      </td>
                      <td className="px-3 py-2 text-chef-text-muted">
                        {dishCount} dish{dishCount === 1 ? "" : "es"}
                        {addonCount > 0 ? `, ${addonCount} add-on${addonCount === 1 ? "" : "s"}` : ""}
                      </td>
                      <td className="px-3 py-2 capitalize text-chef-sage">{order.status}</td>
                    </tr>
                    {isOpen && (
                      <tr className="border-t border-chef-border bg-chef-surface/40">
                        <td colSpan={5} className="px-3 py-3">
                          <ul className="space-y-1 text-sm">
                            {order.items.map((item, idx) => (
                              <li key={`${order.soId}-${idx}`} className="flex justify-between gap-4">
                                <span>
                                  <span className="mr-2 rounded bg-chef-muted px-1.5 py-0.5 text-xs uppercase text-chef-text-muted">
                                    {item.itemKind}
                                  </span>
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
