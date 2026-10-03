"use client";

import Link from "next/link";
import type { Explain, OrderTicket } from "@/lib/domain";
import { accountName } from "@/lib/auth/accounts";
import { can, deniedHint } from "@/lib/auth/permissions";
import { useSession } from "@/lib/auth/session-context";
import { fmtDateTime, fmtInt, fmtPct, fmtPrice, fmtTime, fmtTry } from "@/lib/format";
import { cn } from "@/lib/utils";
import { OrderStatusBadge } from "@/components/ui/order-status";
import { Badge, FixtureBadge, RuleMark } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Countdown, HashChip } from "@/components/ui/data";
import { Tooltip } from "@/components/ui/overlay";
import { SampleNote } from "@/components/ui/primitives";
import { useDesk } from "@/components/shell/desk-state";
import { DisplayText } from "./display-text";
import { Ledger, NotRun, Section, ToneBadge } from "./section";

/**
 * §10 İnsan onayı · §11 Emir ve dolum · §12 Emir fişi (kişisel mod, §2.6 gömülü görünüm)
 * · §13 Audit zinciri. Paper trading only (SimBIST, sanal para).
 */
const APPROVAL_STATUS = {
  pending: { tr: "Onay bekliyor", tone: "wash" },
  claimed: { tr: "İnceleniyor", tone: "wash" },
  approved: { tr: "Onaylandı", tone: "ink" },
  rejected: { tr: "Reddedildi", tone: "north" },
  expired: { tr: "Süresi doldu", tone: "muted" },
  cancelled: { tr: "İptal (kill switch)", tone: "muted" },
} as const;


export function OpenInQueue({ size = "sm", proposalId }: { size?: "sm" | "md"; proposalId?: string | null }) {
  const { role } = useSession();
  if (can(role, "approve")) {
    return (
      <Button asChild size={size} variant="primary">
        <Link href={proposalId ? `/approvals?oneri=${encodeURIComponent(proposalId)}` : "/approvals"}>Onay kuyruğunda aç</Link>
      </Button>
    );
  }
  return (
    <Tooltip content={deniedHint("approve")}>
      <Button size={size} variant="outline" aria-disabled="true" aria-description={deniedHint("approve")} className="cursor-not-allowed opacity-45 shadow-none" onClick={(e) => e.preventDefault()}>
        Onay kuyruğunda aç
      </Button>
    </Tooltip>
  );
}

export function ApprovalSection({ e, pending }: { e: Explain; pending?: string | null }) {
  const a = e.approval;
  const p = e.proposal;
  const st = a ? APPROVAL_STATUS[a.status] : null;
  return (
    <Section
      id="onay"
      num="10"
      title="İnsan onayı"
      meta="Her öneri Risk Officer onayına gider (R15); yanıtlanmazsa ertesi seans 09:50'de düşer"
      pending={pending}
      tone={a?.status === "rejected" ? "critical" : "panel"}
      stamp={st ? <ToneBadge tone={st.tone}>{st.tr}</ToneBadge> : null}
      actions={a?.status === "pending" ? <OpenInQueue proposalId={a.proposal_id} /> : null}
    >
      {!a || !p ? (
        <NotRun>Öneri üretilmedi; onay adımı yok.</NotRun>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Ledger
            rows={[
              { k: "Öneri", v: <span className="code">{a.proposal_id}</span>, hint: a.level === "escalate" ? "escalate" : "normal seviye" },
              { k: "Talep edilen → risk sonrası", v: `${fmtTry(a.requested_notional_try)} → ${fmtTry(a.final_notional_try)}` },
              { k: "Adet · limit", v: `${fmtInt(a.qty)} lot @ ${fmtPrice(a.limit_price)}`, hint: a.entry === "intraday_limit" ? "seans içi limit" : "açılış müzayedesi" },
              { k: "Stop · tutma", v: `${fmtPrice(p.stop_price)} · ${p.holding_days_min === p.holding_days_max ? p.holding_days_min : `${p.holding_days_min}–${p.holding_days_max}`} seans` },
              { k: "Avantaj / maliyet", v: `${p.expected_edge_bps} bp / ${p.est_cost_bps} bp = ${(p.expected_edge_bps / Math.max(1, p.est_cost_bps)).toFixed(1).replace(".", ",")}×`, hint: "eşik 2,0×" },
              { k: "Çarpanlar", v: `kanıt ×${p.multipliers.evidence} · şüpheci ×${String(p.multipliers.skeptic).replace(".", ",")} · sızıntı ×${p.multipliers.leakage} · rejim ×${p.multipliers.regime}` },
            ]}
          />
          <div className="space-y-3">
            {a.status === "pending" ? (
              <div className="border-[1.5px] border-wash bg-wash-tint px-4 py-3">
                <p className="text-dense font-medium text-wash">Graf interrupt() noktasında duruyor — insan onayı bekleniyor.</p>
                <Countdown to={a.expires_at} label="Düşmesine" className="mt-1" />
                <p className="mt-1 text-meta text-muted">Son: {fmtDateTime(a.expires_at)}</p>
              </div>
            ) : (
              <Ledger
                rows={[
                  { k: "Karar veren", v: a.decided_by ? accountName(a.decided_by) : "—", hint: a.decided_at ? fmtDateTime(a.decided_at) : undefined },
                  { k: "Yorum", v: a.decision_comment ? <q>{a.decision_comment}</q> : "—" },
                  a.approved_notional_try ? { k: "Küçültülen tutar", v: fmtTry(a.approved_notional_try) } : null,
                ]}
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <HashChip hash={a.prompt_manifest_hash} label="prompt_manifest" />
              <HashChip hash={p.rules_hash} label="rules_hash" />
              <Badge tone="muted" className="code">{p.strategy_version}</Badge>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

export function OrderSection({ e }: { e: Explain }) {
  const desk = useDesk();
  const equity = desk.risk?.equity ?? null;
  return (
    <Section id="emir" num="11" title="Emir ve dolum" meta="SimBIST paper — sanal para; dolum değerleri örnek" stamp={e.fills.length ? <SampleNote /> : null}>
      {e.orders.length === 0 ? (
        <NotRun>{e.approval?.status === "pending" ? "Onay verilince SimBIST'e emir gönderilir; dolum burada görünür." : "Emir yok."}</NotRun>
      ) : (
        <div className="space-y-4">
          {e.orders.map((o) => (
            <div key={o.id} className="border-[1.5px] border-ink">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline bg-sunk px-4 py-2 text-dense">
                <span className="code font-medium">{o.id}</span>
                <span>
                  {o.side === "buy" ? "Alış" : "Satış (çıkış)"} · {o.order_type === "limit" ? "limit" : "piyasa"} · {o.tif === "opg" ? "açılış" : "günlük"}
                </span>
                <OrderStatusBadge order={o} />
                {o.is_fixture ? <FixtureBadge /> : null}
                <span className="ml-auto text-meta text-muted">{fmtDateTime(o.created_at)}</span>
              </div>
              {o.fills.length ? (
                <ul>
                  {o.fills.map((f) => {
                    const notional = f.qty * f.price;
                    return (
                      <li key={f.id} className="flex flex-wrap items-end gap-x-8 gap-y-3 px-4 py-3">
                        <div>
                          <div className="text-meta text-muted">Dolum · {fmtTime(f.filled_at)}</div>
                          <div className="font-display text-[30px] leading-none tabular-nums text-ink">
                            <DisplayText text={`${fmtInt(f.qty)} lot @ ${fmtPrice(f.price)}`} />
                          </div>
                        </div>
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-dense sm:grid-cols-4">
                          <div><dt className="text-meta text-muted">Tutar</dt><dd className="tabular-nums">{fmtTry(notional)}</dd></div>
                          <div><dt className="text-meta text-muted">Komisyon + BSMV</dt><dd className="tabular-nums">{fmtPrice(f.commission + f.bsmv)}</dd></div>
                          <div><dt className="text-meta text-muted">Kayma</dt><dd className="tabular-nums">{f.slippage_bps} bp</dd></div>
                          <div><dt className="text-meta text-muted">Özsermaye payı</dt><dd className="tabular-nums">{equity ? fmtPct(notional / equity, 1) : "—"}</dd></div>
                        </dl>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-4 py-3 text-dense text-muted">Dolum bekleniyor ({o.qty} lot{o.limit_price ? ` @ ${fmtPrice(o.limit_price)}` : ""}).</p>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

export function TicketSection({ ticket, approved }: { ticket: OrderTicket; approved: boolean }) {
  const lines: Array<[string, string]> = [
    ["Olay", ticket.event_line_tr],
    ["KAP", ticket.kap_line_tr],
    ["Önemlilik", ticket.materiality_line_tr],
    ["Sızıntı", ticket.leakage_line_tr],
    ["Kanıt", ticket.evidence_line_tr],
    ["Maliyet", ticket.cost_line_tr],
    ["Avantaj / maliyet", ticket.edge_cost_line_tr],
    ["Şüpheci", ticket.skeptic_line_tr],
    ["Tutar kontrolü (R14)", ticket.amount_check_line_tr],
    ["Stop", ticket.stop_line_tr],
    ["Planlanan çıkış", ticket.planned_exit_tr],
  ];
  return (
    <Section
      id="emir-fisi"
      num="12"
      title="Emir fişi · kişisel mod"
      meta="Manuel giriş için; paylaşım ve dışa aktarma yok (FR-27). Kişisel mod · örnek hesap"
      stamp={
        <>
          {ticket.is_fixture ? <FixtureBadge /> : null}
          {approved ? null : <Badge tone="wash">Önizleme · onaydan sonra geçerli</Badge>}
        </>
      }
    >
      <article aria-label={`Emir fişi ${ticket.ticket_no}`} className="border-[1.5px] border-ink bg-paper paper-grain">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b-[1.5px] border-ink px-4 py-3">
          <div>
            <p className="code text-muted">{ticket.ticket_no} · {ticket.rules_version}</p>
            <p className="mt-1 font-display text-[26px] leading-tight text-ink">
              <DisplayText text={`${ticket.company_name} · LİMİT ${fmtPrice(ticket.limit_price).replace(" TL", "")} · ${fmtInt(ticket.qty)} lot`} />
            </p>
            <p className="text-dense text-ink-soft">
              {ticket.session_tr} · geçerlilik {fmtTime(ticket.created_at)}–{fmtTime(ticket.valid_until)} (30 dk) · manuel giriş
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 text-right text-dense">
            <div>
              <dt className="text-meta text-muted">Tahmini tutar</dt>
              <dd className="tabular-nums">{fmtTry(ticket.est_notional_try)}</dd>
            </div>
            <div>
              <dt className="text-meta text-muted">Örnek hesap payı</dt>
              <dd className="tabular-nums">{fmtPct(ticket.est_notional_try / ticket.account_equity_try, 1)}</dd>
            </div>
          </dl>
        </header>
        <dl className="grid sm:grid-cols-[160px_1fr]">
          {lines.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="border-b border-hairline px-4 pt-2 text-meta text-muted sm:py-2">{k}</dt>
              <dd className="border-b border-hairline px-4 pb-2 text-dense text-ink sm:py-2">{v}</dd>
            </div>
          ))}
        </dl>
        <footer className="space-y-3 px-4 py-3">
          <div>
            <p className="mb-1.5 text-meta text-muted">Kapı sonuçları</p>
            <ul className="flex flex-wrap gap-1.5" aria-label="Risk kapısı sonuçları">
              {ticket.gate_results.map((g) => (
                <li key={g.code} className={cn("code border px-1.5 py-0.5", g.passed ? "border-ink text-ink" : "border-north bg-north-tint text-north")}>
                  {g.code} {g.passed ? "✓" : "✗"}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RuleMark passed label={<span className="text-meta text-ink-soft">mod anahtarları: config {ticket.mode_keys.config ? "✓" : "✗"} · env {ticket.mode_keys.env ? "✓" : "✗"} · UI {ticket.mode_keys.ui ? "✓" : "✗"}</span>} />
            <HashChip hash={ticket.audit_hash} label="audit" />
            <HashChip hash={ticket.prev_hash} label="prev" />
          </div>
          <p className="text-meta text-muted">Onay son tarihi {fmtDateTime(ticket.approval_deadline)} · Yatırım tavsiyesi değildir; ders projesi, sanal para.</p>
        </footer>
      </article>
    </Section>
  );
}

export function AuditSection({ e }: { e: Explain }) {
  const rows = e.audit_positions;
  return (
    <Section
      id="audit"
      num="13"
      title="Audit zinciri"
      meta="Bu koşunun hash zincirindeki kayıtları; konuma tıklayın, denetim kaydında açılır"
      actions={
        <Link href={`/audit?run=${encodeURIComponent(e.run.run_id)}`} className="text-dense font-medium text-ink underline underline-offset-4 hover:text-wash">
          Koşunun tüm audit kayıtları →
        </Link>
      }
    >
      {rows.length === 0 ? (
        <NotRun>Bu koşu için oturumda yazılmış zincir kaydı yok; temel zincir kayıtları /audit’te.</NotRun>
      ) : (
        <ol className="divide-y divide-hairline border-y border-hairline">
          {rows.map((r) => (
            <li key={r.chain_pos} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
              <Link href={`/audit?pos=${r.chain_pos}`} className="code w-20 font-medium text-ink underline underline-offset-4 hover:text-wash">
                #{fmtInt(r.chain_pos)}
              </Link>
              <span className="code min-w-0 flex-1 text-ink-soft">{r.action}</span>
              <HashChip hash={r.hash} label="hash" />
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
