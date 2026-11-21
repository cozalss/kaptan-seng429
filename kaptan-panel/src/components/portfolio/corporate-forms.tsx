"use client";

import { useState, type FormEvent } from "react";
import type { CorporateKind, CorporateNotice } from "@/lib/domain/corporate";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { currentTimeMs } from "@/lib/clock";
import { fmtInt } from "@/lib/format";
import { istanbulDay } from "@/lib/session-day";
import { tickerFromTyping } from "@/lib/solo/holding-draft";
import { moneyError, parseMoney } from "@/lib/solo/money-input";
import { fmtLira } from "@/lib/solo/words";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/solo/money-field";
import { PlainField } from "@/components/solo/plain-field";

/** What a form starts with: the share, and the numbers a KAP notice gave when the code could read them. */
export interface CorporateDefaults {
  ticker?: string;
  noticeId?: string;
  /** A dividend's date or a bonus' ex-date from the notice (YYYY-MM-DD). */
  day?: string;
  bonusPct?: number | null;
  /** The notice's own estimate, shown only as a hint: the bank's number is what counts. */
  expectedGross?: number | null;
}

export const defaultsFromNotice = (n: CorporateNotice): CorporateDefaults => ({
  ticker: n.ticker,
  noticeId: n.id,
  day: n.kind === "dividend" ? (n.pay_date ?? undefined) : (n.ex_date ?? undefined),
  bonusPct: n.bonus_pct,
  expectedGross: n.expected_gross_try,
});

const TITLES: Record<CorporateKind, string> = { dividend: "Kâr payı geldi", bonus: "Bedelsiz pay geldi", rights: "Bedelli pay aldım" };
const SUBMIT: Record<CorporateKind, string> = { dividend: "Kâr payını yaz", bonus: "Bedelsiz payı yaz", rights: "Bedelli payı yaz" };

const wholeNumber = (draft: string): number | null => {
  const t = draft.trim().replace(/\./g, "");
  return /^\d+$/.test(t) && Number(t) > 0 ? Number(t) : null;
};

/**
 * One form for the three things a company can do to a share you hold. Everything typed is what
 * happened at your bank; KAPtan moves nothing. Errors sit under their field after the first try,
 * the server's own sentence is shown as it comes.
 */
export function CorporateForm({ kind, defaults = {}, onDone, onCancel }: { kind: CorporateKind; defaults?: CorporateDefaults; onDone: (message: string) => void; onCancel: () => void }) {
  const api = useApi();
  const today = istanbulDay(currentTimeMs());
  const [ticker, setTicker] = useState(defaults.ticker ?? "");
  const [day, setDay] = useState(defaults.day && defaults.day <= today ? defaults.day : "");
  const [net, setNet] = useState("");
  const [gross, setGross] = useState("");
  const [newQty, setNewQty] = useState("");
  const [pct, setPct] = useState(defaults.bonusPct ? String(defaults.bonusPct).replace(".", ",") : "");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const errors = {
    ticker: ticker.length < 3 ? "Hisse kodunu yaz; 3 ile 6 harf." : null,
    day: !day ? "Bir gün seç." : day > today ? "Gelecekteki bir günü seçemezsin." : null,
    net: moneyError(net),
    newQty: kind === "bonus" && !newQty.trim() && !pct.trim() ? "Yeni adedi ya da yüzdeyi yaz." : newQty.trim() && wholeNumber(newQty) === null ? "Adedi rakamla yaz." : null,
    pct: pct.trim() && (parseMoney(pct) ?? 0) <= 0 ? "Yüzdeyi rakamla yaz." : newQty.trim() && pct.trim() ? "Yeni adedi ya da yüzdeyi yaz; ikisini birden değil." : null,
    qty: kind === "rights" && wholeNumber(qty) === null ? "Kaç pay aldığını yaz." : null,
    price: kind === "rights" ? moneyError(price) : null,
    gross: gross.trim() ? moneyError(gross) : null,
  };
  const shown = (key: keyof typeof errors) => (tried ? errors[key] : null);
  const own = kind === "dividend" ? (errors.net ?? errors.gross) : kind === "bonus" ? (errors.newQty ?? errors.pct) : (errors.qty ?? errors.price);
  const blocking = errors.ticker ?? errors.day ?? own;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (blocking) return;
    setBusy(true);
    setFailure(null);
    const common = { ticker, note: "", notice_id: defaults.noticeId ?? null };
    try {
      if (kind === "dividend") {
        const amount = parseMoney(net) ?? 0;
        await api.recordDividend({ ...common, net_try: amount, gross_try: gross.trim() ? parseMoney(gross) : null, received_on: day });
        onDone(`${ticker}: ${fmtLira(amount, true)} kâr payı yazıldı. Kazancına eklendi.`);
      } else if (kind === "bonus") {
        await api.recordBonus({ ...common, ex_date: day, new_qty: newQty.trim() ? wholeNumber(newQty) : null, bonus_pct: pct.trim() ? parseMoney(pct) : null });
        onDone(`${ticker}: bedelsiz pay yazıldı. Toplam maliyetin aynı kaldı; tanesinin maliyeti düştü.`);
      } else {
        const adet = wholeNumber(qty) ?? 0;
        await api.recordRights({ ...common, subscribed_on: day, qty: adet, price: parseMoney(price) ?? 0 });
        onDone(`${ticker}: ${fmtInt(adet)} bedelli pay yazıldı. Ödediğin para nakdinden düştü.`);
      }
    } catch (err) {
      setFailure(errorMessage(err));
      setBusy(false);
    }
  };

  const hint = defaults.expectedGross ? `Bildirime göre brüt yaklaşık ${fmtLira(defaults.expectedGross, true)}; bankanın gösterdiği net tutarı yaz.` : "Bankanın hesabına geçtiğini gösterdiği tutar (kesintiden sonraki).";
  return (
    <form onSubmit={submit} noValidate className="om-panel mf-form" aria-label={TITLES[kind]}>
      <h3 className="om-panel-title">{TITLES[kind]}</h3>
      <div className="mf-grid">
        <PlainField label="Hisse kodu" value={ticker} onChange={(e) => setTicker(tickerFromTyping(e.target.value))} error={shown("ticker")} autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={6} className="mf-plain--code" />
        <PlainField
          label={kind === "dividend" ? "Ne zaman hesabına geçti?" : kind === "bonus" ? "Hangi gün yeni fiyattan işlem görmeye başladı?" : "Ne zaman katıldın?"}
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          error={shown("day")}
          max={today}
        />
        {kind === "dividend" ? (
          <>
            <MoneyField label="Hesabına ne kadar geçti?" value={net} onChange={setNet} error={shown("net")} hint={hint} />
            <MoneyField label="Kesintiden önceki tutar (biliyorsan)" value={gross} onChange={setGross} error={shown("gross")} readOut={false} />
          </>
        ) : null}
        {kind === "bonus" ? (
          <>
            <PlainField label="Yeni toplam adedin" value={newQty} onChange={(e) => setNewQty(e.target.value)} error={shown("newQty")} inputMode="numeric" autoComplete="off" hint="Bankanın gösterdiği yeni adet." />
            <PlainField label="ya da bedelsiz oranı (%)" value={pct} onChange={(e) => setPct(e.target.value)} error={shown("pct")} inputMode="decimal" autoComplete="off" hint="% 100 = her paya bir yeni pay." />
          </>
        ) : null}
        {kind === "rights" ? (
          <>
            <PlainField label="Kaç pay aldın?" value={qty} onChange={(e) => setQty(e.target.value)} error={shown("qty")} inputMode="numeric" autoComplete="off" />
            <MoneyField label="Tanesine kaç lira ödedin?" value={price} onChange={setPrice} error={shown("price")} readOut={false} maxDecimals={4} />
          </>
        ) : null}
      </div>
      {failure ? (
        <p role="alert" className="mf-error mf-error--form">
          {failure}
        </p>
      ) : null}
      <div className="mf-actions">
        <Button type="submit" variant="primary" size="lg" disabled={busy} pending={busy}>
          {busy ? "Yazılıyor…" : SUBMIT[kind]}
        </Button>
        <Button variant="ghost" size="lg" onClick={onCancel} disabled={busy}>
          Vazgeç
        </Button>
      </div>
    </form>
  );
}
