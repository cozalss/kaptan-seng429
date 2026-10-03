"use client";

import Link from "next/link";
import type { OrderTicket } from "@/lib/domain";
import { fmtDateTime, fmtInt, fmtPct, fmtPrice, fmtTime, fmtTry } from "@/lib/format";
import { useNow } from "@/lib/clock";
import { Badge, FixtureBadge, RuleMark } from "@/components/ui/badge";
import { Countdown, HashChip } from "@/components/ui/data";
import { EmptyState } from "@/components/ui/primitives";

/** Ticket validity: 30 min from creation (12 §2); expired tickets must not be entered. */
export function ticketExpired(t: Pick<OrderTicket, "valid_until">, nowMs: number): boolean {
  return Date.parse(t.valid_until) <= nowMs;
}

/**
 * Personal-mode order ticket (12 §2, 11 Adım 6): the human enters it by hand at their broker.
 * No sharing and no export (FR-27, R-24) — the slip is read here, nowhere else.
 */
export function OrderTicketsView({ tickets }: { tickets: readonly OrderTicket[] }) {
  if (!tickets.length) {
    return <EmptyState title="Emir fişi yok" body="Kişisel modda onaylanan her öneri için 30 dakika geçerli bir emir fişi üretilir; fiş elle girilir." />;
  }
  return (
    <div className="space-y-6">
      {tickets.map((t) => (
        <TicketSlip key={t.ticket_no} t={t} />
      ))}
    </div>
  );
}

function TicketSlip({ t }: { t: OrderTicket }) {
  const now = useNow(5_000);
  const expired = now !== null && ticketExpired(t, now);
  const share = t.est_notional_try / t.account_equity_try;
  const ceilingGap = t.upper_limit / t.limit_price - 1;
  const lines: ReadonlyArray<[string, string]> = [
    ["Olay", t.event_line_tr],
    ["KAP", t.kap_line_tr],
    ["Önemlilik", t.materiality_line_tr],
    ["Sızıntı", t.leakage_line_tr],
    ["Kanıt", t.evidence_line_tr],
    ["Maliyet", t.cost_line_tr],
    ["Avantaj / maliyet", t.edge_cost_line_tr],
    ["Şüpheci", t.skeptic_line_tr],
    ["Tutar kontrolü", t.amount_check_line_tr],
    ["Stop", t.stop_line_tr],
    ["Planlanan çıkış", t.planned_exit_tr],
  ];
  return (
    <article aria-labelledby={`fis-${t.ticket_no}`} className="mx-auto max-w-[760px] border-[1.5px] border-ink bg-panel shadow-ink-lg">
      <header className="flex flex-wrap items-start gap-3 border-b-[1.5px] border-ink px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-meta text-muted">
            <span>Kişisel mod · örnek hesap {fmtTry(t.account_equity_try)}</span>
            {t.is_fixture ? <FixtureBadge /> : null}
            <Badge tone="muted">Temsili</Badge>
          </div>
          <h3 id={`fis-${t.ticket_no}`} className="title-display mt-2 text-[34px] text-ink">
            Emir fişi
          </h3>
          <p className="code mt-1 text-ink-soft">
            {t.ticket_no} · {t.rules_version}
          </p>
        </div>
        <div className="text-right">
          {expired ? (
            <Badge tone="north">Süresi doldu · girmeyin</Badge>
          ) : (
            <Countdown to={t.valid_until} label="Geçerli" />
          )}
          <p className="mt-1 text-meta text-muted">
            {fmtTime(t.created_at)} → {fmtTime(t.valid_until)} (30 dk)
          </p>
        </div>
      </header>

      <div className="grid gap-px bg-hairline sm:grid-cols-[1.3fr_1fr]">
        <div className="bg-panel px-5 py-4">
          <p className="text-meta text-muted">{t.company_name} · {t.market}</p>
          <p className="mt-1 font-display text-[30px] leading-tight text-ink">
            AL <span className="code text-[24px]">{t.ticker}</span>
          </p>
          <p className="mt-1 font-display text-[26px] leading-tight tabular-nums text-ink">
            LİMİT {fmtPrice(t.limit_price)} · {fmtInt(t.qty)} lot
          </p>
          <p className="mt-2 text-dense text-ink-soft">{t.session_tr} · Manuel giriş</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 bg-panel px-5 py-4 text-dense">
          <div>
            <dt className="text-meta text-muted">Tahmini tutar</dt>
            <dd className="font-medium tabular-nums">{fmtTry(t.est_notional_try)}</dd>
          </div>
          <div>
            <dt className="text-meta text-muted">Hesabın payı (R07 ≤ %10)</dt>
            <dd className="font-medium tabular-nums">{fmtPct(share, 1)}</dd>
          </div>
          <div>
            <dt className="text-meta text-muted">Referans fiyat</dt>
            <dd className="tabular-nums">{fmtPrice(t.ref_price)}</dd>
          </div>
          <div>
            <dt className="text-meta text-muted">Tavan / mesafe</dt>
            <dd className="tabular-nums">
              {fmtPrice(t.upper_limit)} · {fmtPct(ceilingGap, 1)}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-meta text-muted">Onay</dt>
            <dd>
              {fmtDateTime(t.approved_at)} · {t.approval_level === "escalate" ? "escalate" : "normal"} · son onay {fmtTime(t.approval_deadline)}
            </dd>
          </div>
        </dl>
      </div>

      <dl className="divide-y divide-hairline border-t-[1.5px] border-ink">
        {lines.map(([k, v]) => (
          <div key={k} className="grid gap-x-4 px-5 py-2 sm:grid-cols-[150px_1fr]">
            <dt className="text-meta text-muted sm:text-dense">{k}</dt>
            <dd className="text-dense text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      <section aria-label="Risk kapısı sonuçları" className="border-t-[1.5px] border-ink px-5 py-3">
        <p className="text-meta text-muted">Risk kapısı R01–R16 (çalışma sırasıyla)</p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
          {t.gate_results.map((g) => (
            <li key={g.code}>
              <RuleMark passed={g.passed} critical={!g.passed} label={<span className="code text-ink-soft">{g.code}</span>} />
            </li>
          ))}
        </ul>
      </section>

      <footer className="flex flex-wrap items-center gap-2 border-t border-hairline px-5 py-3">
        <span className="text-meta text-muted">Mod anahtarları</span>
        {(["config", "env", "ui"] as const).map((k) => (
          <Badge key={k} tone={t.mode_keys[k] ? "ink" : "muted"}>
            {k} {t.mode_keys[k] ? "✓" : "✗"}
          </Badge>
        ))}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <HashChip hash={t.audit_hash} label="audit" />
          <HashChip hash={t.prev_hash} label="önceki" />
        </span>
      </footer>
      <p className="border-t border-hairline px-5 py-2 text-meta text-muted">
        Fiş paylaşılmaz ve dışa aktarılmaz. Yatırım tavsiyesi değildir.{" "}
        <Link href={`/runs/${t.run_id}#emir-fisi`} className="font-medium text-ink underline underline-offset-4">
          Gerekçesini aç
        </Link>
      </p>
    </article>
  );
}
