"use client";

import { useState, type FormEvent } from "react";
import type { Position } from "@/lib/domain";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { currentTimeMs } from "@/lib/clock";
import { fmtInt } from "@/lib/format";
import { checkSaleDraft, PRICE_DECIMALS, type SaleDraft, type SaleErrors } from "@/lib/solo/holding-draft";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/solo/money-field";
import { PlainField } from "@/components/solo/plain-field";

const EMPTY: SaleDraft = { qty: "", price: "", commission: "" };
const NO_ERRORS: SaleErrors = { qty: null, price: null, commission: null };

/**
 * "Sattım" for a share the person added by hand (a suggested one is sold through its own order).
 * They sold it at their bank; this writes down what the bank did: how many, at what price, and
 * what it charged. Left empty, the commission is estimated and the answer says so.
 */
export function SellForm({ position, onSold, onCancel }: { position: Position; onSold: (left: Position | null, sold: SaleDraft) => void; onCancel: () => void }) {
  const api = useApi();
  const [draft, setDraft] = useState<SaleDraft>(EMPTY);
  const [shown, setShown] = useState<SaleErrors>(NO_ERRORS);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const edit = (patch: Partial<SaleDraft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    setFailure(null);
    if (tried) setShown(checkSaleDraft(next, position.qty).errors);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const check = checkSaleDraft(draft, position.qty);
    setTried(true);
    setShown(check.errors);
    if (!check.input) return;
    setBusy(true);
    setFailure(null);
    try {
      const left = await api.sellHolding(position.id, { ...check.input, sold_at: new Date(currentTimeMs()).toISOString() });
      onSold(left, draft);
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="mf-form" aria-label={`${position.ticker} satışı`}>
      <div className="mf-grid">
        <PlainField label="Kaç adet sattın?" value={draft.qty} onChange={(e) => edit({ qty: e.target.value })} error={shown.qty} hint={`Elinde ${fmtInt(position.qty)} adet var.`} inputMode="numeric" autoComplete="off" autoFocus />
        <MoneyField label="Tanesini kaç liradan sattın?" value={draft.price} onChange={(price) => edit({ price })} error={shown.price} maxDecimals={PRICE_DECIMALS} readOut={false} />
        <MoneyField label="Bankan ne kadar komisyon kesti?" value={draft.commission} onChange={(commission) => edit({ commission })} error={shown.commission} hint="Boş bırakabilirsin; o zaman KAPtan tahmin eder ve bunu sana söyler." readOut={false} />
      </div>
      {failure ? (
        <p role="alert" className="mf-error mf-error--form">
          {failure}
        </p>
      ) : null}
      <div className="mf-actions">
        <Button type="submit" variant="primary" size="lg" disabled={busy} pending={busy}>
          {busy ? "Kaydediliyor…" : "Satışı kaydet"}
        </Button>
        <Button variant="ghost" size="lg" onClick={onCancel} disabled={busy}>
          Vazgeç
        </Button>
      </div>
    </form>
  );
}
