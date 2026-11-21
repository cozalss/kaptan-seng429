"use client";

import "@/components/ufuk/ufuk.css";
import "@/components/portfolio/own-money.css";

import { useApiQuery } from "@/lib/api/react";
import { useNow } from "@/lib/clock";
import { fmtInt } from "@/lib/format";
import type { PreviousBook } from "@/lib/solo/money";
import { fmtMoney, movementDay, movementSentence, movementStatusNote } from "@/lib/solo/money-words";

/** "12 Kasım – 3 Aralık": the days a closed book was in use. */
function span(b: PreviousBook, now: number | null): string {
  return `${movementDay(b.opened_at, now)} – ${movementDay(b.closed_at, now)}`;
}

/**
 * "Önceki defterlerin": the books closed by "Baştan başla", read-only. Nothing in them is live: they show
 * what the person started with, what the book held when it closed and every movement as it was
 * written (a fixed or taken-back one says so). Nothing is drawn when there is no earlier book.
 */
export function PreviousBooks() {
  const q = useApiQuery((api) => api.previousBooks(), []);
  const now = useNow(60_000);
  const books = q.data ?? [];
  if (books.length === 0) return null;

  return (
    <section aria-labelledby="onceki-defterler" className="om pb">
      <h2 id="onceki-defterler" className="u-chapter text-ink">
        Önceki defterlerin
      </h2>
      <p className="om-lead">Baştan başladığın zaman kapanan defterler. Burada yalnızca okursun; hiçbiri silinmedi.</p>
      {books.map((b) => (
        <details key={b.no} className="pb-book" data-book={b.no}>
          <summary className="pb-summary">
            <strong>{b.no}. defter</strong> · {span(b, now)} · {fmtMoney(b.started_with)} ile başlamıştın
          </summary>
          <dl className="pb-facts">
            <div>
              <dt className="u-caption">Kapanırken hepsi birlikte</dt>
              <dd>{fmtMoney(b.equity)}</dd>
            </div>
            <div>
              <dt className="u-caption">Nakit</dt>
              <dd>{fmtMoney(b.cash)}</dd>
            </div>
            <div>
              <dt className="u-caption">Koyduğun para</dt>
              <dd>{fmtMoney(b.put_in)}</dd>
            </div>
          </dl>
          {b.positions.length ? (
            <p className="om-panel-lead">Kapanırken elinde olanlar: {b.positions.map((p) => `${p.ticker} (${fmtInt(p.qty)} adet)`).join(", ")}.</p>
          ) : null}
          <ol className="om-list" aria-label={`${b.no}. defterin hareketleri`}>
            {b.movements.map((m) => (
              <li key={m.id} className={m.status === "undone" ? "om-item-text--undone" : undefined}>
                {movementSentence(m, now)} {movementStatusNote(m)}
              </li>
            ))}
          </ol>
        </details>
      ))}
    </section>
  );
}
