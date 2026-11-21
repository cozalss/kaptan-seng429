"use client";

import { useRef, useState, type FormEvent } from "react";
import type { OrderTicket } from "@/lib/domain";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { fmtPrice } from "@/lib/format";
import { parseMoney } from "@/lib/solo/money-input";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/solo/money-field";
import { PlainField } from "@/components/solo/plain-field";
import { markErrors, parsePrice, parseQty, type MarkDraft } from "@/components/tickets/ticket-logic";

/** The slip's own words for "the commission came from a rate": which rate, whose. */
export function commissionRateWords(rate: number | null, own: boolean): string | null {
  if (rate === null) return null;
  const permille = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(rate * 1000);
  return own ? `Senin komisyon oranınla (binde ${permille}) hesaplandı.` : `KAPtan’ın hazır oranıyla (binde ${permille}) hesaplandı; kendi oranını Ayarlar’dan yazabilirsin.`;
}

/**
 * "Yanlış yazdım": the fill recorded on an entered slip was typed wrong (adet, price or commission).
 * The slip's own rules still hold. The old numbers stay in Geçmiş; cash and the share are
 * recomputed. A sale's adet cannot change (the position it closed may be gone): the form says so.
 */
export function FixFill({ ticket, onFixed }: { ticket: OrderTicket; onFixed: (t: OrderTicket) => void }) {
  const api = useApi();
  const e = ticket.entry;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<MarkDraft | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const isSell = ticket.side === "sell";

  const start = () => {
    setDraft({ kind: "entered", qty: String(e.filled_qty ?? ""), price: fmtPrice(e.avg_price ?? 0).replace(/\s?TL$/, ""), commission: e.commission_estimated ? "" : String(e.commission_try).replace(".", ","), time: "12:00", note: "" });
    setTried(false);
    setFailure(null);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => opener.current?.focus());
  };

  if (!open || !draft) {
    return (
      <Button ref={opener} variant="link" onClick={start} className="oneri-slip-fix">
        Yanlış yazdım, düzelteyim
      </Button>
    );
  }

  const errors = tried ? markErrors(draft, ticket) : null;
  const edit = (patch: Partial<MarkDraft>) => {
    setDraft({ ...draft, ...patch });
    setFailure(null);
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setTried(true);
    const found = markErrors(draft, ticket);
    const qty = parseQty(draft.qty);
    const price = parsePrice(draft.price);
    if (found.qty || found.price || found.commission || qty === null || price === null) return;
    const commission = draft.commission.trim() ? parseMoney(draft.commission) : null;
    setBusy(true);
    setFailure(null);
    try {
      onFixed(await api.correctFill(ticket.ticket_no, { filled_qty: qty, avg_price: price, ...(commission === null ? {} : { commission_try: commission }) }));
      setOpen(false);
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="oneri-slip-actions-form" aria-label="Girdiğini düzelt">
      <p className="oneri-slip-ask">Bankanın gerçekte yaptığını yaz. Eski rakamlar Geçmiş’te kalır; paran ve elindeki hisse yeniden hesaplanır.</p>
      <div className="oneri-slip-fields">
        <PlainField label="Adet" inputMode="numeric" value={draft.qty} onChange={(ev) => edit({ qty: ev.target.value })} error={errors?.qty ?? null} className="tabular-nums" autoFocus autoComplete="off" disabled={isSell} hint={isSell ? "Satışta adet değişmez; fiyatı ve komisyonu düzeltebilirsin." : undefined} />
        <PlainField label="Tanesi kaç ₺" inputMode="decimal" value={draft.price} onChange={(ev) => edit({ price: ev.target.value })} error={errors?.price ?? null} className="tabular-nums" autoComplete="off" />
      </div>
      <MoneyField label="Bankan ne kadar komisyon kesti?" value={draft.commission} onChange={(commission) => edit({ commission })} error={errors?.commission ?? null} hint="Boş bırakabilirsin; o zaman KAPtan tahmin eder ve hangi oranla yaptığını söyler." readOut={false} />
      {failure ? (
        <p role="alert" className="oneri-object-error">
          {failure}
        </p>
      ) : null}
      <div className="oneri-slip-buttons">
        <Button type="submit" variant="primary" size="lg" disabled={busy} pending={busy}>
          {busy ? "Düzeltiyorum…" : "Düzeltmeyi kaydet"}
        </Button>
        <Button variant="ghost" size="lg" onClick={close} disabled={busy}>
          Vazgeç
        </Button>
      </div>
    </form>
  );
}
