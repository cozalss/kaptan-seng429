"use client";

import "./watchlist.css";

import Link from "next/link";
import { useApiQuery } from "@/lib/api/react";
import { useNow } from "@/lib/clock";
import { fmtSignedFigurePct } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { companyName } from "@/components/company/company-words";
import { TickerLink } from "@/components/company/ticker-link";
import { signTone } from "@/components/story/sign-tone";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { ageWords, isFresh } from "./watch-logic";

/**
 * "İzlediklerim": a quiet strip on the home. Each starred company with its last close, the change on the last
 * session and how old its newest disclosure is; a new disclosure is marked. Nothing is drawn when you watch no one.
 */
export function WatchStrip() {
  const q = useApiQuery((api) => api.watchlist(), []);
  const now = useNow(60_000);
  useEventStream("feed", { disclosure: () => void q.refetch() });
  const items = q.data ?? [];
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="izlediklerim" className="wl-strip">
      <h2 id="izlediklerim" className="u-caption">
        İzlediklerim
      </h2>
      <ul className="wl-list">
        {items.map((w) => (
          <li key={w.ticker} className="wl-item">
            <p className="wl-name">
              <TickerLink ticker={w.ticker} className="wl-ticker" />
              <span className="wl-company">{companyName(w.name)}</span>
              {now !== null && isFresh(w, now) ? <span className="wl-new">Yeni duyuru</span> : null}
            </p>
            <p className="wl-figures tabular-nums">
              {w.last_close === null ? (
                "Fiyat kaydı yok"
              ) : (
                <>
                  {w.last_close.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺
                  {w.change_pct !== null ? <span className={cn("wl-change", signTone(w.change_pct))}> {fmtSignedFigurePct(w.change_pct / 100)}</span> : null}
                </>
              )}
            </p>
            <p className="wl-age">{now === null ? "" : ageWords(w.newest_disclosure_at, now)}</p>
          </li>
        ))}
      </ul>
      <Link href={`${ROUTES.bildirimler}?kimler=izlediklerim`} className="wl-all">
        Hepsinin duyurularını gör →
      </Link>
    </section>
  );
}
