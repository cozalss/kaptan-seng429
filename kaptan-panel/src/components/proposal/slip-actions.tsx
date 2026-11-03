"use client";

import { useEffect, useRef, useState } from "react";
import type { OrderTicket } from "@/lib/domain";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { currentTimeMs } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { buildMarkInput, hasMarkErrors, initialDraft, markErrors, ticketCopyText, type MarkDraft, type MarkKind } from "@/components/tickets/ticket-logic";

/** How long "Kopyalandı" stays before the button says "Kopyala" again. */
const COPIED_MS = 2_400;

type Mode = "idle" | "entered" | "failed";

/**
 * The slip's actions: Kopyala, Girdim (then "how many, at what price") and Giremedim (then which
 * of the two it was). Kopyala answers in place: the button says so, the boxes flash once, and the
 * line under it shows the order line that went to the clipboard.
 */
export function SlipActions({ ticket, onMarked, onCopied }: { ticket: OrderTicket; onMarked: (t: OrderTicket) => void; onCopied?: () => void }) {
  const api = useApi();
  const [copied, setCopied] = useState<"idle" | "done" | "fail">("idle");
  const [mode, setMode] = useState<Mode>("idle");
  const [draft, setDraft] = useState<MarkDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);
  const copyText = ticketCopyText(ticket);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied("done");
      onCopied?.();
    } catch {
      setCopied("fail");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied("idle"), COPIED_MS);
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
  const back = () => {
    setMode("idle");
    setDraft(null);
    setError(null);
  };
  const failure = error ? (
    <p role="alert" className="oneri-object-error">
      {error}
    </p>
  ) : null;

  if (mode === "entered" && draft) {
    return (
      <form
        className="oneri-slip-actions-form"
        onSubmit={(e) => {
          e.preventDefault();
          void mark(draft);
        }}
      >
        <p className="oneri-slip-ask">Kaç adet, hangi fiyattan {ticket.side === "sell" ? "sattın" : "aldın"}?</p>
        <div className="oneri-slip-fields">
          <label>
            <span className="u-caption">Adet</span>
            <Input inputMode="numeric" value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })} className="h-11 tabular-nums" autoFocus />
          </label>
          <label>
            <span className="u-caption">Tanesi kaç ₺</span>
            <Input inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} className="h-11 tabular-nums" />
          </label>
        </div>
        {failure}
        <div className="oneri-slip-buttons">
          <Button type="submit" variant="primary" size="lg" disabled={busy}>
            {busy ? "Kaydediliyor…" : "Kaydet"}
          </Button>
          <Button variant="ghost" size="lg" onClick={back} disabled={busy}>
            Vazgeç
          </Button>
        </div>
      </form>
    );
  }

  if (mode === "failed") {
    return (
      <div className="oneri-slip-actions-form">
        <p className="oneri-slip-ask">Ne oldu?</p>
        <div className="oneri-slip-buttons">
          <Button variant="secondary" size="lg" disabled={busy} onClick={() => quick("unfilled")}>
            Girdim, gerçekleşmedi
          </Button>
          <Button variant="secondary" size="lg" disabled={busy} onClick={() => quick("canceled")}>
            Girmedim
          </Button>
          <Button variant="ghost" size="lg" disabled={busy} onClick={back}>
            Vazgeç
          </Button>
        </div>
        {failure}
      </div>
    );
  }

  return (
    <div className="oneri-slip-actions-form">
      <div className="oneri-slip-buttons">
        <Button variant="secondary" size="lg" className="oneri-slip-copy" onClick={() => void copy()}>
          <span key={copied} className={cn("inline-flex items-center gap-1.5", copied !== "idle" && "animate-fade-in")}>
            {copied === "done" ? (
              <>
                Kopyalandı <span aria-hidden>✓</span>
              </>
            ) : (
              "Kopyala"
            )}
          </span>
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={() => {
            setDraft(initialDraft("entered", ticket, currentTimeMs()));
            setMode("entered");
          }}
        >
          Girdim
        </Button>
        <Button variant="outline" size="lg" onClick={() => setMode("failed")}>
          Giremedim
        </Button>
      </div>
      <p className="oneri-slip-copyline" aria-live="polite">
        {copied === "fail" ? (
          "Panoya kopyalanamadı; bilgileri yukarıdan elle yaz."
        ) : copied === "done" ? (
          <>
            Panoya kopyalandı: <span className="code">{copyText.split("\n")[1]}</span>
          </>
        ) : (
          "Kopyala, bilgileri bankanın uygulamasına yapıştırmak için panoya alır."
        )}
      </p>
      {failure}
    </div>
  );
}
