"use client";

import "@/components/ufuk/ufuk.css";
import "./own-money.css";

import { useRef, useState, type FormEvent } from "react";
import type { Position } from "@/lib/domain";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { useNow } from "@/lib/clock";
import { fmtInt } from "@/lib/format";
import type { MoneyBook } from "@/lib/solo/money";
import { moneyError, parseMoney } from "@/lib/solo/money-input";
import { fmtMoney, movementSentence } from "@/lib/solo/money-words";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/solo/money-field";
import { HoldingForm } from "./holding-form";

type Panel = "deposit" | "withdrawal" | "holding" | null;

/** How many movements show before "Hepsini göster". */
const SHOWN = 5;

const WORDS = {
  deposit: { label: "Para ekle", field: "Ne kadar ekliyorsun?", submit: "Parayı ekle", busy: "Ekleniyor…", done: (a: string) => `${a} ekledin.`, hint: "KAPtan para göndermez; bankana eklediğin parayı buraya yazarsın. Bu para kazanç sayılmaz." },
  withdrawal: { label: "Para çek", field: "Ne kadar çekiyorsun?", submit: "Parayı çek", busy: "Çekiliyor…", done: (a: string) => `${a} çektin.`, hint: "Yalnızca boştaki nakitten çekebilirsin. Çektiğin para ne kazanç sayılır ne zarar." },
} as const;

/**
 * Param's money: what the person has put in and what is free cash, the two buttons that tell
 * KAPtan about money moved at the bank (it never moves money itself), a share they already hold,
 * and every movement as a plain sentence. After each action the screen reloads and a status line
 * says what was written; focus goes back to the button that opened the form.
 */
export function MoneySection({ book, onChanged }: { book: MoneyBook | null; onChanged: () => void }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const now = useNow(60_000);
  const opener = useRef<HTMLButtonElement | null>(null);

  const open = (next: Exclude<Panel, null>, from: HTMLButtonElement) => {
    opener.current = from;
    setStatus(null);
    setPanel(next);
  };
  const close = (message: string | null) => {
    setPanel(null);
    setStatus(message);
    requestAnimationFrame(() => opener.current?.focus());
    if (message) onChanged();
  };

  const movements = book?.movements ?? [];
  const list = all ? movements : movements.slice(0, SHOWN);

  return (
    <section aria-labelledby="koydugun-para" className="om">
      <div className="om-head">
        <h2 id="koydugun-para" className="u-chapter text-ink">
          {book ? `Şimdiye kadar ${fmtMoney(book.put_in)} koydun.` : "Koyduğun parayı getiriyorum…"}
        </h2>
        {book ? (
          <p className="om-lead">
            Bunun <strong>{fmtMoney(book.cash)}</strong> şu an nakit duruyor. Bankanda para eklersen ya da çekersen buraya da yaz; KAPtan öneri büyüklüğünü bu paraya göre hesaplar.
          </p>
        ) : null}
      </div>

      <div className="om-actions">
        <Button variant={panel === "deposit" ? "primary" : "secondary"} size="lg" aria-expanded={panel === "deposit"} onClick={(e) => open("deposit", e.currentTarget)} disabled={!book}>
          Para ekle
        </Button>
        <Button variant={panel === "withdrawal" ? "primary" : "secondary"} size="lg" aria-expanded={panel === "withdrawal"} onClick={(e) => open("withdrawal", e.currentTarget)} disabled={!book}>
          Para çek
        </Button>
        <Button variant="outline" size="lg" aria-expanded={panel === "holding"} onClick={(e) => open("holding", e.currentTarget)} disabled={!book}>
          Elindeki bir hisseyi ekle
        </Button>
      </div>

      <p role="status" className="om-status">
        {status}
      </p>

      {panel === "deposit" || panel === "withdrawal" ? <MoneyForm key={panel} kind={panel} onDone={close} /> : null}
      {panel === "holding" ? (
        <div className="om-panel">
          <h3 className="om-panel-title">Elindeki bir hisseyi ekle</h3>
          <p className="om-panel-lead">Daha önce aldığın bir hisse. Aldığın fiyattan Param’a girer; nakdine dokunmaz. KAPtan bunun için satış önerisi vermez.</p>
          <HoldingForm onAdded={(p: Position) => close(`${p.ticker} eklendi: ${fmtInt(p.qty)} adet.`)} onCancel={() => close(null)} />
        </div>
      ) : null}

      {movements.length ? (
        <div className="om-log">
          <h3 className="u-caption">Paranın hareketleri</h3>
          <ol className="om-list">
            {list.map((m) => (
              <li key={m.id}>{movementSentence(m, now)}</li>
            ))}
          </ol>
          {movements.length > SHOWN ? (
            <Button variant="link" aria-expanded={all} onClick={() => setAll((v) => !v)}>
              {all ? "Son birkaçını göster" : `Hepsini göster (${movements.length})`}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function MoneyForm({ kind, onDone }: { kind: "deposit" | "withdrawal"; onDone: (message: string | null) => void }) {
  const api = useApi();
  const words = WORDS[kind];
  const [draft, setDraft] = useState("");
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
      await api.moveMoney({ kind, amount_try: amount });
      onDone(words.done(fmtMoney(amount)));
    } catch (err) {
      // The server's own sentence ("Kasandaki paradan fazlasını çekemezsin.") as it comes.
      setFailure(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="om-panel mf-form" aria-label={words.label}>
      <MoneyField label={words.field} value={draft} onChange={(d) => { setDraft(d); setFailure(null); }} error={error} hint={words.hint} autoFocus />
      {failure ? (
        <p role="alert" className="mf-error mf-error--form">
          {failure}
        </p>
      ) : null}
      <div className="mf-actions">
        <Button type="submit" variant="primary" size="lg" disabled={busy} pending={busy}>
          {busy ? words.busy : words.submit}
        </Button>
        <Button variant="ghost" size="lg" onClick={() => onDone(null)} disabled={busy}>
          Vazgeç
        </Button>
      </div>
    </form>
  );
}
