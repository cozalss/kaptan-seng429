"use client";

import { useRef, useState, type FormEvent } from "react";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { currentTimeMs } from "@/lib/clock";
import { istanbulDay } from "@/lib/session-day";
import { fmtInt } from "@/lib/format";
import type { MoneyMovement, MovementCorrectInput } from "@/lib/solo/money";
import { moneyDraftOf, moneyError, parseMoney } from "@/lib/solo/money-input";
import { fmtMoney, movementSentence, movementStatusNote } from "@/lib/solo/money-words";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/solo/money-field";
import { PlainField } from "@/components/solo/plain-field";
import { PRICE_DECIMALS } from "@/lib/solo/holding-draft";

type Mode = "view" | "correct" | "undo";

const FIX_WORDS = {
  start: { open: "Başlangıç parasını değiştir", field: "Başlangıç paran ne kadardı?", hint: "Bu bir kazanç ya da zarar sayılmaz; yalnızca yanlış yazdığını düzeltirsin." },
  deposit: { open: "Tutarı düzelt", field: "Doğrusu ne kadardı?", hint: "Bankana gerçekte eklediğin tutarı yaz. Kazanç ya da zarar sayılmaz." },
  withdrawal: { open: "Tutarı düzelt", field: "Doğrusu ne kadardı?", hint: "Bankandan gerçekte çektiğin tutarı yaz. Kazanç ya da zarar sayılmaz." },
  holding: { open: "Düzelt", field: "", hint: "" },
} as const;

/**
 * One movement of the money log with its two corrections: "Düzelt" (the amount was typed wrong)
 * and "Bunu yanlış girdim" (take it back). Nothing is erased: the row stays and says what happened
 * to it, and the cash and the money put in move by the difference, never as a gain or a loss.
 * The starting money can be changed but not taken back (that is "Baştan başla").
 */
export function MovementRow({ m, now, onChanged }: { m: MoneyMovement; now: number | null; onChanged: (message: string) => void }) {
  const [mode, setMode] = useState<Mode>("view");
  const opener = useRef<HTMLButtonElement | null>(null);
  const settled = m.status === "undone";
  const words = FIX_WORDS[m.kind];

  const open = (next: Mode, from: HTMLButtonElement) => {
    opener.current = from;
    setMode(next);
  };
  const close = (message: string | null) => {
    setMode("view");
    requestAnimationFrame(() => opener.current?.focus());
    if (message) onChanged(message);
  };
  const note = movementStatusNote(m);

  return (
    <li data-movement={m.id} data-status={m.status} className="om-item">
      <p className={settled ? "om-item-text om-item-text--undone" : "om-item-text"}>
        {movementSentence(m, now)}
        {note ? <span className="om-item-note"> {note}</span> : null}
      </p>
      {!settled && mode === "view" ? (
        <div className="om-item-actions">
          <Button variant="link" onClick={(e) => open("correct", e.currentTarget)} aria-label={`${movementSentence(m, now)} ${words.open}`}>
            {words.open}
          </Button>
          {m.kind === "start" ? null : (
            <Button variant="link" onClick={(e) => open("undo", e.currentTarget)} aria-label={`${movementSentence(m, now)} Bunu yanlış girdim`}>
              Bunu yanlış girdim
            </Button>
          )}
        </div>
      ) : null}
      {mode === "correct" ? m.kind === "holding" ? <HoldingFix m={m} onDone={close} /> : <AmountFix m={m} onDone={close} /> : null}
      {mode === "undo" ? <UndoAsk m={m} onDone={close} /> : null}
    </li>
  );
}

function AmountFix({ m, onDone }: { m: MoneyMovement; onDone: (message: string | null) => void }) {
  const api = useApi();
  const words = FIX_WORDS[m.kind];
  const [draft, setDraft] = useState(moneyDraftOf(m.amount_try));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const error = tried ? moneyError(draft) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    const amount = parseMoney(draft);
    if (moneyError(draft) !== null || amount === null) return;
    setBusy(true);
    setFailure(null);
    try {
      await api.correctMovement(m.id, { amount_try: amount });
      onDone(`Düzelttin: ${fmtMoney(m.amount_try)} yerine ${fmtMoney(amount)}.`);
    } catch (err) {
      setFailure(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="om-panel mf-form" aria-label={words.open}>
      <MoneyField label={words.field} value={draft} onChange={(d) => { setDraft(d); setFailure(null); }} error={error} hint={words.hint} autoFocus />
      {failure ? (
        <p role="alert" className="mf-error mf-error--form">
          {failure}
        </p>
      ) : null}
      <div className="mf-actions">
        <Button type="submit" variant="primary" size="lg" disabled={busy} pending={busy}>
          {busy ? "Kaydediliyor…" : "Düzeltmeyi kaydet"}
        </Button>
        <Button variant="ghost" size="lg" onClick={() => onDone(null)} disabled={busy}>
          Vazgeç
        </Button>
      </div>
    </form>
  );
}

/** A share added by hand: its adet, what each cost and the day, as they really were. */
function HoldingFix({ m, onDone }: { m: MoneyMovement; onDone: (message: string | null) => void }) {
  const api = useApi();
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const today = istanbulDay(currentTimeMs());
  const qtyNum = /^\d+$/.test(qty.trim()) ? Number(qty.trim()) : null;
  const costNum = parseMoney(cost, PRICE_DECIMALS);
  const qtyError = tried && (qtyNum === null || qtyNum < 1) ? "Kaç adet olduğunu rakamla yaz." : null;
  const costError = tried ? moneyError(cost, { maxDecimals: PRICE_DECIMALS }) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (qtyNum === null || qtyNum < 1 || costNum === null || moneyError(cost, { maxDecimals: PRICE_DECIMALS }) !== null) return;
    const input: MovementCorrectInput = { qty: qtyNum, avg_cost: costNum, ...(day ? { bought_on: day } : {}) };
    setBusy(true);
    setFailure(null);
    try {
      await api.correctMovement(m.id, input);
      onDone(`Düzelttin: ${fmtInt(qtyNum)} adet, tanesi ${fmtMoney(costNum)}.`);
    } catch (err) {
      setFailure(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="om-panel mf-form" aria-label="Elindeki hisseyi düzelt">
      <p className="om-panel-lead">Hisseyi doğru yazdığın hâliyle yeniden gir. Nakdine dokunmaz; kazanç ya da zarar sayılmaz.</p>
      <div className="mf-grid">
        <PlainField label="Doğrusu kaç adet?" value={qty} onChange={(e) => { setQty(e.target.value); setFailure(null); }} error={qtyError} inputMode="numeric" autoComplete="off" autoFocus />
        <MoneyField label="Tanesini kaç liradan almıştın?" value={cost} onChange={(c) => { setCost(c); setFailure(null); }} error={costError} maxDecimals={PRICE_DECIMALS} readOut={false} />
        <PlainField label="Ne zaman almıştın? (istersen)" type="date" value={day} onChange={(e) => setDay(e.target.value)} error={null} max={today} />
      </div>
      {failure ? (
        <p role="alert" className="mf-error mf-error--form">
          {failure}
        </p>
      ) : null}
      <div className="mf-actions">
        <Button type="submit" variant="primary" size="lg" disabled={busy} pending={busy}>
          {busy ? "Kaydediliyor…" : "Düzeltmeyi kaydet"}
        </Button>
        <Button variant="ghost" size="lg" onClick={() => onDone(null)} disabled={busy}>
          Vazgeç
        </Button>
      </div>
    </form>
  );
}

function UndoAsk({ m, onDone }: { m: MoneyMovement; onDone: (message: string | null) => void }) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const undo = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await api.undoMovement(m.id);
      onDone("Geri aldın. Kayıt listede duruyor, “geri alındı” yazıyor.");
    } catch (err) {
      setFailure(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="om-panel" role="group" aria-label="Bunu yanlış girdim">
      <p className="om-panel-lead">
        Bunu geri alırsan para (ya da hisse) sanki hiç girmemişsin gibi hesaplanır; kazanç ya da zarar sayılmaz. Kayıt listeden silinmez, “geri alındı” diye kalır.
      </p>
      {failure ? (
        <p role="alert" className="mf-error mf-error--form">
          {failure}
        </p>
      ) : null}
      <div className="mf-actions">
        <Button variant="primary" size="lg" onClick={() => void undo()} disabled={busy} pending={busy}>
          {busy ? "Geri alınıyor…" : "Evet, geri al"}
        </Button>
        <Button variant="ghost" size="lg" onClick={() => onDone(null)} disabled={busy}>
          Vazgeç
        </Button>
      </div>
    </div>
  );
}
