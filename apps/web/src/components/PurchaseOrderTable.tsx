"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";

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
      <h2 className="text-lg font-semibold text-chef-text">Processed purchase orders</h2>
      <p className="mt-1 text-sm text-chef-text-muted">
        Orders appear here after you click Process. Upload new files above anytime.
      </p>

      {loading && (
        <p className="mt-4 text-sm text-chef-text-muted">Loading purchase orders…</p>
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
        <div className="mt-4 rounded-xl border border-dashed border-chef-border bg-chef-muted/30 px-4 py-8 text-center text-sm text-chef-text-muted">
          No processed orders yet. Upload files above, then click Process.
        </div>
      )}

      {!loading && orders.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-chef-border bg-chef-surface">
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
                return (
                  <Fragment key={po.poId}>
                    <tr className="border-b border-chef-border hover:bg-chef-muted/30">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-chef-text">
                      {po.poId}
                    </td>
                    <td className="max-w-[8rem] truncate px-4 py-3 text-chef-text-muted" title={po.storeName ?? po.vendor}>
                      {po.storeName ?? po.vendor ?? "—"}
                    </td>
                    <td
                        className="max-w-[12rem] truncate px-4 py-3 text-chef-text"
                        title={po.filename}
                      >
                        {po.filename}
                      </td>
                      <td className="px-4 py-3 text-chef-text-muted">
                        {formatDate(po.purchaseDate)}
                      </td>
                      <td className="px-4 py-3 text-chef-text-muted">{formatDate(po.uploadDate)}</td>
                      <td className="px-4 py-3 text-chef-text-muted">
                        {po.items.length} item{po.items.length !== 1 ? "s" : ""}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => toggleRow(po.poId)}
                          className="text-chef-sage hover:underline"
                        >
                          {isOpen ? "Hide" : "View"}
                        </button>
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
                            className="mt-2 inline-block text-xs text-chef-sage underline"
                          >
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
