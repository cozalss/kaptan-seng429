"use client";

import "@/components/ufuk/ufuk.css";
import "@/components/portfolio/own-money.css";
import "./insights.css";

import { useState } from "react";
import type { ClosedTrades } from "@/lib/domain/insights";
import { fmtSignedFigurePct } from "@/lib/format";
import { fmtSignedLira } from "@/lib/solo/words";
import { cn } from "@/lib/utils";
import { dateWords } from "@/components/portfolio/param-words";
import { signTone } from "@/components/story/sign-tone";
import { Button } from "@/components/ui/button";

const SHOWN = 6;

function title(d: ClosedTrades): string {
  const n = d.trades.length;
  if (d.wins === 0) return `Sattığın ${n} işlemin hiçbiri kazandırmadı.`;
  if (d.wins === n) return n === 1 ? "Sattığın işlem kazandırdı." : `Sattığın ${n} işlemin hepsi kazandırdı.`;
  return `Sattığın ${n} işlemin ${d.wins} tanesi kazandırdı.`;
}

/**
 * The shares you sold, one line each: what they made after commission, how many days you held them, and the win rate.
 * Hidden until the first sale is written down.
 */
export function ClosedTradesBlock({ data }: { data: ClosedTrades | undefined }) {
  const [all, setAll] = useState(false);
  if (!data || data.trades.length === 0) return null;
  const list = all ? data.trades : data.trades.slice(0, SHOWN);

  return (
    <section aria-labelledby="satislar" className="om">
      <div className="om-head">
        <h2 id="satislar" className="u-chapter text-ink">
          {title(data)}
        </h2>
        <p className="ins-lead">
          Toplamda <strong className={cn(signTone(data.total_gain_try))}>{fmtSignedLira(data.total_gain_try)}</strong> {data.total_gain_try < 0 ? "kaybettin" : "kazandın"}
          {data.win_rate_pct !== null ? ` (kazandıran satışların oranı %${Math.round(data.win_rate_pct)})` : ""}
          {data.avg_days_held !== null ? `; ortalama ${Math.round(data.avg_days_held)} gün tuttun` : ""}. Her satışta komisyon sayıldı.
        </p>
        {data.note_tr ? <p className="ins-sub">{data.note_tr}</p> : null}
      </div>

      <ul className="mt-6 max-w-[58rem] p-0" style={{ listStyle: "none" }} aria-label="Kapanmış işlemler">
        {list.map((t) => (
          <li key={t.id} className="ins-trade">
            <span>
              <strong>{t.company}</strong> <span className="ins-sub">{t.ticker}</span>
            </span>
            <span className={cn("ins-num font-semibold", signTone(t.gain_try))}>
              {fmtSignedLira(t.gain_try)}
              {t.gain_pct !== null ? ` · ${fmtSignedFigurePct(t.gain_pct / 100)}` : ""}
            </span>
            <span className="ins-sub">
              {dateWords(t.sold_at.slice(0, 10))}: {t.qty} adet sattın{t.days_held !== null ? `, ${t.days_held} gün tuttun` : ""}
            </span>
          </li>
        ))}
      </ul>
      {data.trades.length > SHOWN ? (
        <Button variant="link" className="mt-3" onClick={() => setAll(!all)}>
          {all ? "Daha azını göster" : `Hepsini göster (${data.trades.length})`}
        </Button>
      ) : null}
    </section>
  );
}
