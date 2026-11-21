"use client";

import { useState } from "react";
import type { TrackItem, TrackSummary } from "@/lib/domain";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { decisionTone, signedRatio } from "./report-words";

/**
 * "KAPtan ne kadar tuttu?": the plain summary first (how many rose, how many fell, the average, with
 * the honest word when there are few), then the comparison with what you did, then every suggestion
 * with its own result. A suggestion whose period is not over says when it will be.
 */
export function TrackSummaryBlock({ summary }: { summary: TrackSummary }) {
  return (
    <div data-testid="track-summary">
      <p className="text-body font-semibold text-ink">{summary.headline_tr}</p>
      {summary.caveat_tr ? (
        <p className="mt-2 max-w-[66ch] text-ui text-ink-soft" data-testid="track-caveat">
          {summary.caveat_tr}
        </p>
      ) : null}
      {summary.done > 0 ? (
        <dl className="rp-facts mt-5">
          <Fact label="Ortalama sonuç" value={signedRatio(summary.avg_ratio)} />
          {summary.index_avg_ratio !== null ? <Fact label="Aynı günlerde BIST 100" value={signedRatio(summary.index_avg_ratio)} /> : null}
          {summary.best ? <Fact label="En iyisi" value={`${summary.best.ticker} ${signedRatio(summary.best.ratio)}`} /> : null}
          {summary.worst ? <Fact label="En kötüsü" value={`${summary.worst.ticker} ${signedRatio(summary.worst.ratio)}`} /> : null}
          <Fact label="Hâlâ süresi dolmayan" value={fmtInt(summary.open)} />
        </dl>
      ) : null}
      {summary.compare_tr ? (
        <p className="mt-5 max-w-[66ch] text-body text-ink" data-testid="track-compare">
          {summary.compare_tr}
        </p>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="u-caption text-ink-soft">{label}</dt>
      <dd className="rp-fig text-ink">{value}</dd>
    </div>
  );
}

const SHOWN = 8;

export function TrackList({ items }: { items: readonly TrackItem[] }) {
  const [all, setAll] = useState(false);
  if (items.length === 0) return null;
  // Newest first. Rows past SHOWN are hidden on screen until asked for; a printed report shows them all.
  const rows = [...items].reverse();
  return (
    <div className="mt-6">
      <ol className="rp-list" data-testid="track-list" data-all={all ? "" : undefined}>
        {rows.map((it, i) => (
          <li key={it.proposal_id} className={cn("rp-row", i >= SHOWN && "rp-extra")}>
            <span className="rp-ticker">{it.ticker}</span>
            <span className={cn("rp-decision", `rp-decision--${decisionTone(it.decision)}`)}>{it.decision_tr}</span>
            <span className={cn("rp-result", it.status !== "done" && "text-ink-soft")} data-status={it.status}>
              {it.result_tr}
            </span>
          </li>
        ))}
      </ol>
      {rows.length > SHOWN && !all ? (
        <button type="button" onClick={() => setAll(true)} className="rp-link no-print mt-3 min-h-11">
          Hepsini göster ({fmtInt(rows.length)})
        </button>
      ) : null}
    </div>
  );
}
