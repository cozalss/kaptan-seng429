"use client";

import { useState } from "react";
import type { EvidenceEvent } from "@/lib/domain";
import { fmtPct, fmtSignedPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { chartDomain, distributions, jitter, pctOf, ticks, type Distribution } from "./evidence-stats";

/**
 * Honest strip chart of abnormal returns per horizon (1/5/20/60 gün): every selected event
 * is one dot (no smoothing), the box is the interquartile range, the bar the median, the
 * dashed line zero. One shared x axis; n per row because the 60-day window has gaps.
 * HTML-positioned (not a scaled SVG) so labels keep 12px at phone width.
 */
interface Hover {
  row: string;
  i: number;
  v: number;
  ev: EvidenceEvent;
}

function Row({ d, domain, events, hover, setHover }: { d: Distribution; domain: [number, number]; events: readonly EvidenceEvent[]; hover: Hover | null; setHover: (h: Hover | null) => void }) {
  const withVal = events.filter((e) => typeof e[d.key] === "number");
  return (
    <div className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[64px_minmax(0,1fr)_176px]">
      <div className="text-dense text-ink">
        {d.label}
        <div className="text-meta text-muted">n={d.n}</div>
      </div>
      <div className="relative h-11 border-b border-hairline" aria-hidden>
        <span className="absolute top-0 bottom-0 border-l border-dashed border-ink-soft" style={{ left: `${pctOf(0, domain)}%` }} />
        <span className="absolute top-2 bottom-2 border border-wash bg-wash-tint-strong" style={{ left: `${pctOf(d.q1, domain)}%`, width: `${Math.max(0.5, pctOf(d.q3, domain) - pctOf(d.q1, domain))}%` }} />
        <span className="absolute top-0.5 bottom-0.5 w-[3px] -translate-x-1/2 bg-ink" style={{ left: `${pctOf(d.median, domain)}%` }} />
        {withVal.map((ev, i) => {
          const v = ev[d.key] as number;
          const active = hover?.row === d.key && hover.i === i;
          return (
            <span
              key={ev.ref_id}
              onMouseEnter={() => setHover({ row: d.key, i, v, ev })}
              onMouseLeave={() => setHover(null)}
              title={`${ev.ticker} · ${fmtSignedPct(v, 1)}`}
              className={cn(
                "absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-ink bg-panel ring-2 ring-panel",
                active && "z-10 size-3 bg-ink",
              )}
              style={{ left: `${pctOf(v, domain)}%`, top: `${18 + jitter(i + d.n) * 64}%` }}
            />
          );
        })}
      </div>
      <div className="col-start-2 -mt-1 text-meta text-muted sm:col-start-auto sm:mt-0">
        medyan <span className="font-medium text-ink tabular-nums">{fmtSignedPct(d.median, 1)}</span> · isabet <span className="tabular-nums text-ink">{fmtPct(d.hitRate, 0)}</span>
      </div>
    </div>
  );
}

export function EvidenceChart({ events }: { events: readonly EvidenceEvent[] }) {
  const [hover, setHover] = useState<Hover | null>(null);
  const dists = distributions(events);
  if (dists.length === 0) return <p className="text-dense text-muted">Örnek olay satırı yok.</p>;
  const domain = chartDomain(dists);
  const axis = ticks(domain);
  const summary = dists.map((d) => `${d.label}: n ${d.n}, medyan ${fmtSignedPct(d.median, 1)}, çeyrekler ${fmtSignedPct(d.q1, 1)} ile ${fmtSignedPct(d.q3, 1)}, isabet ${fmtPct(d.hitRate, 0)}`).join("; ");
  return (
    <figure className="min-w-0">
      <div role="img" aria-label={`Benzer olayların anormal getiri dağılımı. ${summary}.`} className="space-y-1">
        {dists.map((d) => (
          <Row key={d.key} d={d} domain={domain} events={events} hover={hover} setHover={setHover} />
        ))}
        <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-3 sm:grid-cols-[64px_minmax(0,1fr)_176px]" aria-hidden>
          <span />
          <div className="relative h-5">
            {axis.map((t) => (
              <span key={t} className={cn("absolute top-1 -translate-x-1/2 text-meta tabular-nums", t === 0 ? "font-medium text-ink" : "text-muted")} style={{ left: `${pctOf(t, domain)}%` }}>
                {t === 0 ? "0" : fmtSignedPct(t, 0)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex min-h-5 flex-wrap items-center justify-between gap-2 text-meta text-muted" aria-live="off">
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block size-[9px] rounded-full border-[1.5px] border-ink" />bir olay</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block h-2.5 w-4 border border-wash bg-wash-tint-strong" />çeyrekler arası</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-[3px] bg-ink" />medyan</span>
        </span>
        <span className="tabular-nums text-ink-soft">{hover ? `${hover.ev.ticker} · ${hover.ev.title.split(" — ")[0]} · ${fmtSignedPct(hover.v, 1)}` : "Noktanın üzerine gelin"}</span>
      </div>
    </figure>
  );
}
