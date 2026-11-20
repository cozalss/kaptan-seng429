"use client";

import { useRef, useState, type FormEvent } from "react";
import type { Position } from "@/lib/domain";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { currentTimeMs } from "@/lib/clock";
import { istanbulDay } from "@/lib/session-day";
import { checkHoldingDraft, PRICE_DECIMALS, tickerFromTyping, type HoldingDraft, type HoldingErrors } from "@/lib/solo/holding-draft";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/solo/money-field";
import { PlainField } from "@/components/solo/plain-field";

const EMPTY: HoldingDraft = { ticker: "", qty: "", cost: "", boughtOn: "" };
const NO_ERRORS: HoldingErrors = { ticker: null, qty: null, cost: null, boughtOn: null };

/**
 * "Elindeki bir hisseyi ekle": a share the person already owned before KAPtan. Four plain
 * questions; it joins Param at what was paid and does not touch the cash. Errors sit under their
 * field once the person has pressed the button (the server's own sentence is shown as it comes).
 */
export function HoldingForm({
  onAdded,
  onCancel,
  cancelLabel = "Vazgeç",
  submitLabel = "Hisseyi ekle",
  autoFocus = true,
}: {
  onAdded: (p: Position) => void;
  onCancel?: () => void;
  cancelLabel?: string;
  submitLabel?: string;
  autoFocus?: boolean;
}) {
  const api = useApi();
  const [draft, setDraft] = useState<HoldingDraft>(EMPTY);
  const [shown, setShown] = useState<HoldingErrors>(NO_ERRORS);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  const today = istanbulDay(currentTimeMs());

  const edit = (patch: Partial<HoldingDraft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    setFailure(null);
    if (tried) setShown(checkHoldingDraft(next, today).errors);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const check = checkHoldingDraft(draft, today);
    setTried(true);
    setShown(check.errors);
    if (!check.input) {
      // The first thing to fix gets the cursor, so a keyboard user is not left searching.
      const field = (Object.keys(check.errors) as Array<keyof HoldingErrors>).find((k) => check.errors[k]);
      if (field === "ticker") first.current?.focus();
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const added = await api.addHolding(check.input);
      setDraft(EMPTY);
      setShown(NO_ERRORS);
      setTried(false);
      onAdded(added);
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="mf-form" aria-label="Elindeki hisseyi ekle">
      <div className="mf-grid">
        <PlainField
          label="Hisse kodu"
          value={draft.ticker}
          onChange={(e) => edit({ ticker: tickerFromTyping(e.target.value) })}
          error={shown.ticker}
          hint="Bankanın uygulamasında şirketin yanında yazan kısa kod."
          inputRef={first}
          autoFocus={autoFocus}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={6}
          className="mf-plain--code"
        />
        <PlainField label="Kaç adet?" value={draft.qty} onChange={(e) => edit({ qty: e.target.value })} error={shown.qty} inputMode="numeric" autoComplete="off" />
        <MoneyField label="Tanesini kaç liradan aldın?" value={draft.cost} onChange={(cost) => edit({ cost })} error={shown.cost} maxDecimals={PRICE_DECIMALS} readOut={false} />
        <PlainField label="Ne zaman aldın?" type="date" value={draft.boughtOn} onChange={(e) => edit({ boughtOn: e.target.value })} error={shown.boughtOn} max={today} />
      </div>
      {failure ? (
        <p role="alert" className="mf-error mf-error--form">
          {failure}
        </p>
      ) : null}
      <div className="mf-actions">
        <Button type="submit" variant="primary" size="lg" disabled={busy} pending={busy}>
          {busy ? "Ekleniyor…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button variant="ghost" size="lg" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
