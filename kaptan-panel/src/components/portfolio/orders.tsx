"use client";

import Link from "next/link";
import type { Order } from "@/lib/domain";
import { fmtInt, fmtPrice, fmtDateTime } from "@/lib/format";
import { FixtureBadge } from "@/components/ui/badge";
import { OrderStatusBadge } from "@/components/ui/order-status";
import { EmptyState } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";


/** Average fill price and filled quantity of an order. */
export function fillSummary(o: Pick<Order, "fills">): { qty: number; avg: number | null } {
  const qty = o.fills.reduce((a, f) => a + f.qty, 0);
  if (!qty) return { qty: 0, avg: null };
  return { qty, avg: o.fills.reduce((a, f) => a + f.qty * f.price, 0) / qty };
}

/** Orders and fills (SimBIST paper; order-ticket orders are entered by hand). */
export function OrdersView({ orders, killOn }: { orders: readonly Order[]; killOn: boolean }) {
  if (!orders.length) return <EmptyState title="Emir yok" body="Onaylanan her öneri SimBIST'e bir emir olarak gider; dolumlar burada görünür." />;
  const cols: Column<Order>[] = [
    { key: "t", header: "Zaman", cell: (o) => <span className="whitespace-nowrap text-ink-soft">{fmtDateTime(o.created_at)}</span>, sortValue: (o) => o.created_at },
    {
      key: "tk",
      header: "Sembol",
      sortValue: (o) => o.ticker,
      cell: (o) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className="code font-medium">{o.ticker}</span>
          {o.is_fixture ? <FixtureBadge /> : null}
        </span>
      ),
    },
    { key: "s", header: "İşlem", cell: (o) => `${o.side === "buy" ? "AL" : "SAT (çıkış)"} · ${o.order_type === "limit" ? "Limit" : "Piyasa"} · ${o.tif === "opg" ? "açılış" : "gün"}` },
    { key: "q", header: "Adet", align: "right", cell: (o) => fmtInt(o.qty), sortValue: (o) => o.qty },
    { key: "lp", header: "Limit", align: "right", cell: (o) => (o.limit_price ? fmtPrice(o.limit_price) : "—") },
    {
      key: "f",
      header: "Dolum",
      align: "right",
      cell: (o) => {
        const f = fillSummary(o);
        return f.avg === null ? <span className="text-muted">—</span> : <span className="whitespace-nowrap">{fmtInt(f.qty)} @ {fmtPrice(f.avg)}</span>;
      },
    },
    {
      key: "st",
      header: "Durum",
      sortValue: (o) => o.status,
      cell: (o) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <OrderStatusBadge order={o} />
          {o.status === "canceled" && killOn && !o.cancel_reason ? <span className="text-meta text-muted">kill switch</span> : null}
        </span>
      ),
    },
    { key: "b", header: "Aracı", cell: (o) => (o.broker === "simbist" ? "SimBIST (sanal)" : "Emir fişi (manuel)") },
    {
      key: "r",
      header: "",
      cell: (o) => (
        <Link href={`/runs/${o.run_id}`} className="text-dense font-medium underline underline-offset-4" aria-label={`${o.ticker} emri: neden?`}>
          Neden?
        </Link>
      ),
    },
  ];
  return <DataTable caption="Emirler ve dolumlar" columns={cols} rows={orders} getRowId={(o) => o.id} initialSort={{ key: "t", dir: "desc" }} />;
}
