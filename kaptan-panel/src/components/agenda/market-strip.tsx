"use client";

import "./agenda.css";

import { fmtSignedPct } from "@/lib/format";
import { useApiQuery } from "@/lib/api/react";
import { dayLabel } from "@/lib/agenda/agenda";
import { useNow } from "@/lib/clock";
import { istanbulDay } from "@/lib/session-day";
import { cn } from "@/lib/utils";
import { signTone } from "@/components/story/sign-tone";

const nf2 = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * The market in one quiet line: BIST 100 (the last stored close and its change), open or closed, the dollar.
 * Each figure says which day it is from; a figure that is not stored is left out, never guessed.
 */
export function MarketStrip({ className }: { className?: string }) {
  const q = useApiQuery((api) => api.marketStrip(), []);
  const now = useNow(60_000);
  const s = q.data;
  if (!s || now === null) return null;
  const today = istanbulDay(now);
  return (
    <div className={cn("mk-strip", className)} role="group" aria-label="Piyasa">
      <span className="mk-state" data-open={s.market.open}>
        <span aria-hidden className="mk-dot" />
        {s.market.label}
        {!s.market.open && s.market.next_open_day ? <span className="mk-age font-normal text-ink-soft">· {dayLabel(s.market.next_open_day, today)} açılır</span> : null}
      </span>
      {s.index ? (
        <span className="mk-item">
          BIST 100 <strong>{nf2.format(s.index.level)}</strong>
          {s.index.change_pct !== null ? <span className={cn("tabular-nums", signTone(s.index.change_pct))}>{fmtSignedPct(s.index.change_pct / 100, 2)}</span> : null}
          <span className="mk-age">{dayLabel(s.index.day, today)} kapanışı</span>
        </span>
      ) : null}
      {s.usd_try ? (
        <span className="mk-item">
          Dolar <strong>{nf2.format(s.usd_try.rate)} ₺</strong>
          <span className="mk-age">Merkez Bankası, {dayLabel(s.usd_try.day, today)}</span>
        </span>
      ) : null}
    </div>
  );
}
