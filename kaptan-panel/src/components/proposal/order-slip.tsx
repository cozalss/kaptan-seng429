"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DropdownMenu as M } from "radix-ui";
import type { OrderTicket } from "@/lib/domain";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { currentTimeMs, useNow } from "@/lib/clock";
import { fmtDuration, fmtInt, fmtPrice, fmtTime } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Denied } from "@/components/roles/denied";
import { useRole } from "@/components/roles/use-role";
import { Input } from "@/components/ui/field";
import { buildMarkInput, ENTRY_LABEL, hasMarkErrors, initialDraft, isMarkable, markErrors, ticketCopyText, ticketPhase, validFrom, type MarkDraft, type MarkKind } from "@/components/tickets/ticket-logic";

/**
 * The emir fişi as a printed slip: the fields you type into your broker app, the validity
 * clock, Kopyala and Girdim. "Dolmadı" and "İptal" wait behind the small "…" menu.
 */
export function OrderSlip({ ticket, onMarked, compact = false }: { ticket: OrderTicket; onMarked?: (t: OrderTicket) => void; compact?: boolean }) {
  const [current, setCurrent] = useState(ticket);
  const [prevProp, setPrevProp] = useState(ticket);
  if (prevProp !== ticket) {
    setPrevProp(ticket);
    // A late echo of the unmarked ticket must never undo a mark made here.
    if (!(isMarkable(ticket) && !isMarkable(current))) setCurrent(ticket);
  }
  const t = current;
  const marked = !isMarkable(t);
  const done = (next: OrderTicket) => {
    setCurrent(next);
    onMarked?.(next);
  };

  return (
    <div
      data-ticket-slip={t.ticket_no}
      aria-label={`Emir fişi ${t.ticket_no}`}
      role="group"
      className="paper-grain relative border-[1.5px] border-ink bg-panel shadow-ink"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-rule-soft px-5 py-3 sm:px-6">
        <span className="text-[12px] font-medium tracking-[0.08em] text-ink uppercase">Emir fişi</span>
        <span className="code text-[12px] text-muted">{t.ticket_no}</span>
      </div>
      <div className="space-y-4 px-5 py-5 sm:px-6">
        <p className="flex items-baseline gap-3 text-ink">
          <span className="bg-ink px-2 py-0.5 text-[14px] font-medium tracking-[0.08em] text-on-dark">AL</span>
          <span className="code text-[26px] leading-none tracking-normal">{t.ticker}</span>
        </p>
        <dl className={cn("grid gap-x-6 gap-y-3 text-[15px]", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4")}>
          <Field label="Lot" value={fmtInt(t.qty)} />
          <Field label="Limit" value={fmtPrice(t.limit_price)} />
          <Field label="Seans" value={t.session_tr} wide={!compact} />
        </dl>
        {marked ? <Marked ticket={t} /> : <Validity ticket={t} />}
      </div>
      {marked ? null : <SlipActions ticket={t} onMarked={done} />}
    </div>
  );
}

function Field({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2")}>
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink tabular-nums">{value}</dd>
    </div>
  );
}

function Validity({ ticket }: { ticket: OrderTicket }) {
  const now = useNow(1_000);
  if (now === null) return <p className="text-[14px] text-muted">…</p>;
  const phase = ticketPhase(ticket, now);
  const text =
    phase === "upcoming"
      ? `Geçerlilik ${fmtTime(validFrom(ticket))}’de başlar`
      : phase === "expired"
        ? "Süresi doldu — artık girme. Ne olduğunu yine de işaretle."
        : `Geçerli · ${fmtDuration(Date.parse(ticket.valid_until) - now)} kaldı`;
  return (
    <p className={cn("text-[14px] tabular-nums", phase === "valid" ? "text-ink" : "text-muted")} aria-live="off">
      {text}
    </p>
  );
}

function Marked({ ticket }: { ticket: OrderTicket }) {
  const e = ticket.entry;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <p className="animate-stamp-in inline-block -rotate-2 border-2 border-ink px-2.5 py-1 text-[14px] font-medium tracking-[0.06em] text-ink uppercase [--stamp-rot:-2deg]">
        {ENTRY_LABEL[e.status]}
        {e.status === "entered" && e.filled_qty && e.avg_price ? ` · ${fmtInt(e.filled_qty)} lot @ ${fmtPrice(e.avg_price)}` : ""}
      </p>
      {e.status === "entered" ? (
        <Link href={ROUTES.portfoy} className="text-[15px] font-medium text-ink underline underline-offset-4">
          Portföyünde →
        </Link>
      ) : null}
    </div>
  );
}

function SlipActions({ ticket, onMarked }: { ticket: OrderTicket; onMarked: (t: OrderTicket) => void }) {
  const api = useApi();
  const { can } = useRole();
  const mayMark = can("ticket.mark");
  const [copied, setCopied] = useState<"idle" | "done" | "fail">("idle");
  const [draft, setDraft] = useState<MarkDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ticketCopyText(ticket));
      setCopied("done");
    } catch {
      setCopied("fail");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied("idle"), 2_400);
  };

  const mark = async (d: MarkDraft) => {
    if (d.kind === "entered" && hasMarkErrors(markErrors(d, ticket))) {
      setError(Object.values(markErrors(d, ticket)).find(Boolean) ?? null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onMarked(await api.markTicket(ticket.ticket_no, buildMarkInput(d, ticket)));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const quick = (kind: MarkKind) => void mark(initialDraft(kind, ticket, currentTimeMs()));

  return (
    <div className="border-t border-dashed border-rule-soft px-5 py-4 sm:px-6">
      {draft ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void mark(draft);
          }}
        >
          <p className="text-[15px] text-ink">Kaç lot, hangi fiyattan doldu?</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[12px] text-muted">Lot</span>
              <Input inputMode="numeric" value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })} className="tabular-nums" autoFocus />
            </label>
            <label className="space-y-1">
              <span className="text-[12px] text-muted">Ortalama fiyat (TL)</span>
              <Input inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} className="tabular-nums" />
            </label>
          </div>
          {error ? (
            <p role="alert" className="text-[14px] text-north">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Kaydediliyor…" : "Kaydet"}
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
              Vazgeç
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Button variant="primary" size="lg" disabled={!mayMark} onClick={() => setDraft(initialDraft("entered", ticket, currentTimeMs()))}>
              Girdim
            </Button>
            <Button variant="secondary" size="lg" onClick={() => void copy()}>
              {copied === "done" ? "Kopyalandı ✓" : "Kopyala"}
            </Button>
            <M.Root modal={false}>
              <M.Trigger aria-label="Başka bir sonuç" disabled={busy || !mayMark} className="ml-auto grid size-12 place-items-center text-[20px] leading-none text-ink-soft hover:bg-wash-tint hover:text-ink">
                <span aria-hidden>…</span>
              </M.Trigger>
              <M.Portal>
                <M.Content align="end" sideOffset={4} className="z-50 min-w-[180px] border-[1.5px] border-ink bg-panel py-1 shadow-ink">
                  <M.Item onSelect={() => quick("unfilled")} className="cursor-pointer px-4 py-2.5 text-[15px] outline-none data-[highlighted]:bg-wash-tint">
                    Dolmadı
                  </M.Item>
                  <M.Item onSelect={() => quick("canceled")} className="cursor-pointer px-4 py-2.5 text-[15px] outline-none data-[highlighted]:bg-wash-tint">
                    Girmedim (iptal)
                  </M.Item>
                </M.Content>
              </M.Portal>
            </M.Root>
          </div>
          <p className="mt-2.5 text-[13px] text-muted" aria-live="polite">
            {copied === "fail" ? "Panoya kopyalanamadı; alanları elle yaz." : "Kopyala: sembol, yön, lot, limit, seans — aracı kurum uygulamana yapıştırmak için."}
          </p>
          <Denied action="ticket.mark" className="mt-2.5" />
          {error ? (
            <p role="alert" className="mt-2 text-[14px] text-north">
              {error}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
