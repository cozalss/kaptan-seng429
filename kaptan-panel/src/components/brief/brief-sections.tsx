import Link from "next/link";
import type { ReactNode } from "react";
import type { MorningBrief } from "@/lib/domain";
import { fmtDate, fmtDateTime, fmtInt, fmtPrice, fmtSignedPct, fmtTime, fmtTry } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge, EventBadge, FixtureBadge } from "@/components/ui/badge";
import { Countdown } from "@/components/ui/data";
import { OrderStatusBadge } from "@/components/ui/order-status";
import { RESTRICTION_KIND_TR, sortWarnings } from "./brief-math";

/** Numbered brief section: a Bodoni ordinal, a ruled head, and an empty line when there is nothing. */
export function BriefSection({ n, title, count, empty, children, className }: { n: string; title: string; count?: number; empty: string; children: ReactNode; className?: string }) {
  const id = `ozet-${n}`;
  return (
    <section aria-labelledby={id} className={cn("break-inside-avoid", className)}>
      <header className="flex items-baseline gap-3 border-b-[1.5px] border-ink pb-1.5">
        <span aria-hidden className="font-display text-[24px] leading-none text-ink">
          {n}
        </span>
        <h2 id={id} className="flex-1 text-[15px] font-semibold text-ink">
          {title}
        </h2>
        {count !== undefined ? <span className="text-meta tabular-nums text-muted">{fmtInt(count)}</span> : null}
      </header>
      {count === 0 ? <p className="py-3 text-dense text-muted">{empty}</p> : children}
    </section>
  );
}

export function Disclosures({ items }: { items: MorningBrief["important_disclosures"] }) {
  return (
    <ol className="divide-y divide-hairline">
      {items.map((d) => (
        <li key={d.disclosure_index} className="grid grid-cols-[48px_1fr] gap-x-3 py-2">
          <time dateTime={d.published_at} className="text-dense tabular-nums text-ink-soft">
            {fmtTime(d.published_at)}
          </time>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="code font-medium text-ink">{d.primary_ticker}</span>
              {d.classification ? <EventBadge type={d.classification.event_type} compact /> : null}
              <span className="text-dense text-ink">{d.subject}</span>
              {d.ingest_source === "demo" ? <FixtureBadge /> : null}
            </p>
            <p className="mt-0.5 text-dense text-ink-soft">
              {d.summary} · <span className="text-muted">{d.company_name} · Temsili</span>
              {d.run_id ? (
                <>
                  {" "}
                  <Link href={`/runs/${d.run_id}`} className="font-medium text-ink underline underline-offset-4 print:no-underline">
                    Neden?
                  </Link>
                </>
              ) : null}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function OpenOrders({ items }: { items: MorningBrief["orders_for_open"] }) {
  return (
    <ul className="divide-y divide-hairline">
      {items.map((o) => (
        <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-dense">
          <span className="code font-medium">{o.ticker}</span>
          <span className="tabular-nums">
            AL · LİMİT {o.limit_price ? fmtPrice(o.limit_price) : "—"} · {fmtInt(o.qty)} lot
          </span>
          <span className="text-muted tabular-nums">{o.limit_price ? fmtTry(o.limit_price * o.qty) : null}</span>
          <span className="ml-auto inline-flex items-center gap-2">
            <span className="text-meta text-muted">Açılış sonucu</span>
            <OrderStatusBadge order={o} />
            <Link href={`/runs/${o.run_id}#emir`} className="text-meta font-medium underline underline-offset-4" aria-label={`${o.ticker} emri: neden bu işlem?`}>
              Neden?
            </Link>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PendingApprovals({ items }: { items: MorningBrief["pending_approvals"] }) {
  return (
    <ul className="divide-y divide-hairline">
      {items.map((a) => (
        <li key={a.proposal_id} className="grid gap-y-1 py-2 sm:grid-cols-[1fr_auto] sm:gap-x-4">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="code font-medium">{a.ticker}</span>
              {a.event_type !== "EXIT" ? <EventBadge type={a.event_type} compact /> : null}
              {a.level === "escalate" ? <Badge tone="wash">escalate</Badge> : null}
              <span className="text-dense tabular-nums">{fmtTry(a.final_notional_try)}</span>
            </p>
            <p className="mt-0.5 text-dense text-ink-soft">{a.headline_tr}</p>
          </div>
          <div className="text-dense sm:text-right">
            <span className="print:hidden">
              <Countdown to={a.expires_at} label="Düşmesine" />
            </span>
            <span className="block text-meta text-muted">düşer {fmtDateTime(a.expires_at)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Positions({ open, expiring }: { open: MorningBrief["open_positions"]; expiring: MorningBrief["expiring_today"] }) {
  const due = new Set(expiring.map((p) => p.source_proposal));
  return (
    <table className="w-full border-collapse text-dense">
      <caption className="sr-only">Açık pozisyonlar ve bugün tutma süresi dolanlar</caption>
      <thead>
        <tr className="border-b border-hairline text-left text-meta text-muted">
          <th scope="col" className="py-1.5 font-normal">Sembol</th>
          <th scope="col" className="py-1.5 font-normal">Olay</th>
          <th scope="col" className="py-1.5 text-right font-normal">K/Z</th>
          <th scope="col" className="py-1.5 text-right font-normal">Çıkış</th>
        </tr>
      </thead>
      <tbody>
        {open.map((p) => (
          <tr key={p.source_proposal} className={cn("border-b border-hairline", due.has(p.source_proposal) && "bg-wash-tint")}>
            <td className="py-1.5">
              <span className="code font-medium">{p.ticker}</span>
            </td>
            <td className="py-1.5">
              <EventBadge type={p.event_type} compact />
            </td>
            <td className="py-1.5 text-right tabular-nums">{fmtSignedPct(p.last_price / p.avg_cost - 1, 1)}</td>
            <td className="py-1.5 text-right tabular-nums whitespace-nowrap">
              {due.has(p.source_proposal) ? <b className="font-semibold text-wash">bugün</b> : fmtDate(`${p.planned_exit_date}T09:00:00Z`)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const LEVEL = {
  critical: { label: "Kritik", cls: "border-north bg-north text-on-dark" },
  warn: { label: "Uyarı", cls: "border-wash bg-wash-tint text-wash" },
  info: { label: "Bilgi", cls: "border-rule-soft text-ink-soft" },
} as const;

export function Warnings({ items }: { items: MorningBrief["risk_warnings"] }) {
  return (
    <ul className="space-y-1.5 py-2">
      {sortWarnings(items).map((w) => (
        <li key={w.text_tr} className="flex items-start gap-2 text-dense">
          <span className={cn("mt-px inline-flex h-[18px] shrink-0 items-center border px-1.5 text-meta font-medium", LEVEL[w.level].cls)}>{LEVEL[w.level].label}</span>
          <span className="text-ink">{w.text_tr}</span>
        </li>
      ))}
    </ul>
  );
}

export function Restrictions({ items }: { items: MorningBrief["restriction_changes"] }) {
  return (
    <ul className="divide-y divide-hairline">
      {items.map((r) => (
        <li key={`${r.ticker}-${r.at}`} className="flex flex-wrap items-baseline gap-x-2 py-2 text-dense">
          <span className="code font-medium">{r.ticker}</span>
          <span>{RESTRICTION_KIND_TR[r.kind] ?? r.kind}</span>
          <span className={cn("font-medium", r.change === "added" ? "text-ink" : "text-ink-soft")}>{r.change === "added" ? "eklendi" : "kaldırıldı"}</span>
          <span className="ml-auto text-meta text-muted">{fmtDateTime(r.at)}</span>
          {r.change === "added" ? <span className="w-full text-meta text-muted">Bu hissede öneri üretilmez (R04 sert veto, LLM çağrısı 0).</span> : null}
        </li>
      ))}
    </ul>
  );
}
