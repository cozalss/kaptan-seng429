"use client";

import Link from "next/link";
import type { Position } from "@/lib/domain";
import { fmtDate, fmtInt, fmtPrice, fmtSignedPct, fmtTry } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge, EventBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { holdingProgress, positionReturn, type HoldingProgress } from "./risk-math";

function signedTry(n: number): string {
  if (n === 0) return fmtTry(0);
  return `${n > 0 ? "+" : "−"}${fmtTry(Math.abs(n))}`;
}

/** Sessions held vs plan, as a ruled bar (the planned exit is the right edge). */
function Holding({ h }: { h: HoldingProgress }) {
  return (
    <div className="w-[120px]">
      <div className="flex items-baseline justify-between text-dense tabular-nums">
        <span>
          <b className="font-medium">{h.elapsed}</b> / {h.planned} seans
        </span>
      </div>
      <div aria-hidden className="mt-1 h-1.5 border border-ink bg-sunk">
        <div className={cn("h-full", h.dueToday || h.overdue ? "bg-wash" : "bg-ink")} style={{ width: `${h.fraction * 100}%` }} />
      </div>
    </div>
  );
}

function ExitCell({ p, h }: { p: Position; h: HoldingProgress }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 whitespace-nowrap">
      <time dateTime={p.planned_exit_date}>{fmtDate(`${p.planned_exit_date}T09:00:00Z`)}</time>
      {h.dueToday ? <Badge tone="wash">bugün çıkış</Badge> : h.overdue ? <Badge tone="wash">süresi doldu</Badge> : null}
    </span>
  );
}

function ManagedBadge() {
  return (
    <Badge tone="north" title="Kill switch açıldı: pozisyon satılmadı, kendi çıkış kuralıyla yönetiliyor">
      çıkış kuralıyla yönetiliyor
    </Badge>
  );
}

/**
 * Open paper positions (US-34, US-35): entry, sessions held vs plan, planned exit, E-code,
 * unrealized P&L, source run and strategy version. Table on wide screens, cards on phones.
 */
export function PositionsView({ positions, today }: { positions: readonly Position[]; today: string }) {
  if (!positions.length) {
    return (
      <EmptyState
        title="Açık pozisyon yok"
        body="Onaylanan öneriler dolduğunda burada görünür. Kill switch açıkken yeni pozisyon açılmaz."
        action={
          <Link href="/approvals" className="text-dense font-medium underline underline-offset-4">
            Onay kuyruğuna git
          </Link>
        }
      />
    );
  }
  const cols: Column<Position>[] = [
    {
      key: "tk",
      header: "Sembol",
      sortValue: (p) => p.ticker,
      cell: (p) => (
        <span className="block min-w-[150px]">
          <span className="code font-medium text-ink">{p.ticker}</span>
          <span className="block truncate text-meta text-muted">{p.company_name} · Temsili</span>
        </span>
      ),
    },
    { key: "e", header: "Olay", cell: (p) => <EventBadge type={p.event_type} compact />, sortValue: (p) => p.event_type },
    { key: "q", header: "Adet", align: "right", cell: (p) => fmtInt(p.qty), sortValue: (p) => p.qty },
    {
      key: "c",
      header: "Giriş",
      align: "right",
      sortValue: (p) => p.opened_at,
      cell: (p) => (
        <span className="whitespace-nowrap">
          {fmtPrice(p.avg_cost)}
          <span className="block text-meta text-muted">{fmtDate(p.opened_at)}</span>
        </span>
      ),
    },
    { key: "l", header: "Son", align: "right", className: "whitespace-nowrap", cell: (p) => fmtPrice(p.last_price), sortValue: (p) => p.last_price },
    {
      key: "pnl",
      header: "Gerçekleşmemiş K/Z",
      align: "right",
      sortValue: (p) => p.unrealized_pnl,
      cell: (p) => (
        <span className="whitespace-nowrap">
          <b className="font-medium">{signedTry(p.unrealized_pnl)}</b>
          <span className="block text-meta text-muted">{fmtSignedPct(positionReturn(p), 1)}</span>
        </span>
      ),
    },
    { key: "h", header: "Tutma", cell: (p) => <Holding h={holdingProgress(p, today)} />, sortValue: (p) => holdingProgress(p, today).fraction },
    { key: "x", header: "Planlanan çıkış", cell: (p) => <ExitCell p={p} h={holdingProgress(p, today)} />, sortValue: (p) => p.planned_exit_date },
    {
      key: "src",
      header: "Kaynak",
      cell: (p) => (
        <span className="flex flex-wrap items-center gap-1.5 whitespace-nowrap">
          <Link href={`/runs/${p.run_id}`} className="text-dense font-medium underline underline-offset-4 hover:text-wash" aria-label={`${p.ticker}: neden bu işlem?`}>
            Neden?
          </Link>
          <span className="code text-muted">{p.strategy_version}</span>
          {p.managed_by_exit_rule ? <ManagedBadge /> : null}
        </span>
      ),
    },
  ];
  return (
    <>
      <div className="hidden md:block">
        <DataTable caption="Açık pozisyonlar" columns={cols} rows={positions} getRowId={(p) => p.source_proposal} initialSort={{ key: "x", dir: "asc" }} />
      </div>
      <ul className="divide-y divide-hairline md:hidden" aria-label="Açık pozisyonlar">
        {positions.map((p) => {
          const h = holdingProgress(p, today);
          return (
            <li key={p.source_proposal} className="space-y-2 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="code text-[15px] font-medium">{p.ticker}</span>
                <EventBadge type={p.event_type} compact />
                <span className="ml-auto text-dense font-medium tabular-nums">{signedTry(p.unrealized_pnl)}</span>
              </div>
              <p className="text-meta text-muted">
                {p.company_name} · Temsili · {fmtInt(p.qty)} lot @ {fmtPrice(p.avg_cost)} · {fmtSignedPct(positionReturn(p), 1)}
              </p>
              <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
                <Holding h={h} />
                <span className="text-meta text-muted">
                  Çıkış <ExitCell p={p} h={h} />
                </span>
                <Link href={`/runs/${p.run_id}`} className="ml-auto text-dense font-medium underline underline-offset-4">
                  Neden?
                </Link>
              </div>
              {p.managed_by_exit_rule ? <ManagedBadge /> : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
