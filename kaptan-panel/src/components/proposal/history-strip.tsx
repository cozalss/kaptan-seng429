import type { EvidenceEvent } from "@/lib/domain";
import { fmtInt, fmtSignedPct } from "@/lib/format";

/**
 * Past similar events as one strip: each event is a short ink tick placed by how far the
 * stock moved in 5 days. Left of the centre line it fell, right of it it rose. A small
 * triangle marks the median. Read in a second; exact values on hover.
 */
const W = 640;
const H = 64;
const PAD = 14;
const SPAN = 0.1; // ±10 % fills the width; larger moves sit on the edge

export function stripX(ret: number): number {
  const clamped = Math.max(-SPAN, Math.min(SPAN, ret));
  return PAD + ((clamped + SPAN) / (2 * SPAN)) * (W - 2 * PAD);
}

export function HistoryStrip({ events, median, total }: { events: readonly EvidenceEvent[]; median: number; total: number }) {
  const up = events.filter((e) => e.car_5d > 0).length;
  const down = events.length - up;
  const mid = W / 2;
  return (
    <figure className="mt-5">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${fmtInt(events.length)} benzer olay: ${fmtInt(up)} yükseldi, ${fmtInt(down)} düştü; ortanca ${fmtSignedPct(median)}.`} className="h-auto w-full overflow-visible">
        <rect x={mid} y={10} width={W / 2 - PAD} height={40} fill="var(--wash-tint)" />
        <line x1={PAD} x2={W - PAD} y1={50} y2={50} stroke="var(--hairline)" strokeWidth={1} />
        <line x1={mid} x2={mid} y1={4} y2={56} stroke="var(--ink)" strokeWidth={1.5} />
        {events.map((e, i) => {
          const x = stripX(e.car_5d);
          const rose = e.car_5d > 0;
          return (
            <line key={e.ref_id} x1={x} x2={x} y1={rose ? 16 + (i % 3) * 3 : 22 + (i % 3) * 3} y2={44} stroke={rose ? "var(--ink)" : "var(--muted)"} strokeWidth={rose ? 2 : 1.5} strokeLinecap="butt">
              <title>{`${e.company_name}: 5 günde ${fmtSignedPct(e.car_5d)}`}</title>
            </line>
          );
        })}
        <path d={`M${stripX(median) - 5} ${H - 2} L${stripX(median) + 5} ${H - 2} L${stripX(median)} ${H - 9} Z`} fill="var(--ink)" />
      </svg>
      <div aria-hidden className="mt-1 flex justify-between text-[12px] text-muted">
        <span>← düştü</span>
        <span>5 günde</span>
        <span>yükseldi →</span>
      </div>
      <figcaption className="mt-2 text-[14px] leading-[21px] text-ink-soft">
        {events.length < total ? `Çizgide ${fmtInt(events.length)} olay: ` : ""}
        <span className="font-medium text-ink tabular-nums">{fmtInt(up)}</span> yükseldi, <span className="tabular-nums">{fmtInt(down)}</span> düştü
        <span aria-hidden className="mx-2 text-rule-soft">·</span>▲ ortanca (tümü) <span className="tabular-nums">{fmtSignedPct(median)}</span>
      </figcaption>
    </figure>
  );
}
