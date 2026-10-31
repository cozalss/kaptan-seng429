import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CARD, CardHead } from "@/components/portfolio/kit";
import { SkeletonLines } from "@/components/ui/primitives";

/** What the strip draws: today's counters, or counts made from an earlier session's list. */
export interface FlowData {
  total: number;
  noise: number;
  archived: number;
  processed: number;
  e_candidates: number;
  /** Only today's counters know these; an earlier session shows the candidates alone. */
  proposals?: number;
  approvals?: number;
  rejections?: number;
  /** The list hit the API's cap: the day had at least `total`. */
  capped?: boolean;
}

/**
 * The day's disclosures in one strip, the way the desk sees them: everything KAP published was
 * read; most is noise or off-topic and stops there; a few go on to the crew. One hue, light →
 * dark as a notice gets closer to a decision; the counts are written next to every colour.
 */
const SEGMENTS = [
  { key: "noise", label: "gürültü, elendi", swatch: "bg-[var(--flow-1)]" },
  { key: "archived", label: "ilgisiz, arşivlendi", swatch: "bg-[var(--flow-2)]" },
  { key: "processed", label: "tayfaya gönderildi", swatch: "bg-[var(--flow-3)]" },
] as const;

export function FlowStrip({ data, note = "Bugün KAP’ta yayımlananlar", className }: { data: FlowData | null; note?: string; className?: string }) {
  return (
    <section aria-labelledby="bildirim-akisi" className={cn(CARD, "lg:flex lg:items-stretch", className)}>
      <CardHead id="bildirim-akisi" title="Bildirim akışı" note={note} className="lg:w-[220px] lg:shrink-0 lg:border-r lg:border-line lg:py-5" />
      {data ? <Body data={data} /> : <SkeletonLines lines={3} className="flex-1 px-5 py-5" />}
    </section>
  );
}

/** A segment wide enough to carry its own count inside the bar. */
const INLINE_SHARE = 0.12;

/**
 * One row that reads as the product's story: everything read → the bar of what happened to it
 * (counts inside the wide parts) → the funnel onwards: olay adayı → öneri → onay · ret.
 */
function Body({ data }: { data: FlowData }) {
  const total = Math.max(1, data.noise + data.archived + data.processed);
  const full = data.proposals !== undefined;
  return (
    <div className="grid flex-1 gap-x-8 gap-y-4 px-5 pb-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center lg:py-5">
      <div className="min-w-0">
        <p className="flex items-baseline gap-2">
          <span className="text-[30px] leading-9 font-semibold tracking-[-0.02em] text-ink tabular-nums">
            {fmtInt(data.total)}
            {data.capped ? "+" : ""}
          </span>
          <span className="text-ui text-ink-soft">bildirim okundu</span>
        </p>
        <div aria-hidden className="mt-3 flex h-6 gap-[2px] overflow-hidden rounded-md bg-sunk">
          {SEGMENTS.map((s, i) => {
            const n = data[s.key];
            if (n <= 0) return null;
            const share = n / total;
            return (
              <span
                key={s.key}
                className={cn("flex h-full min-w-1.5 items-center px-2 text-[12px] font-semibold tabular-nums", s.swatch, i === 2 ? "text-on-dark" : "text-ink")}
                style={{ flexGrow: share, flexBasis: 0 }}
              >
                {share >= INLINE_SHARE ? fmtInt(n) : null}
              </span>
            );
          })}
        </div>
        <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-dense">
          {SEGMENTS.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-ink-soft">
              <span aria-hidden className={cn("size-2.5 shrink-0 rounded-sm", s.swatch)} />
              <span className="font-semibold text-ink tabular-nums">{fmtInt(data[s.key])}</span>
              {s.label}
            </li>
          ))}
        </ul>
      </div>
      <ol aria-label="Bildirimden onaya" className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
        <Step label="olay adayı" value={data.e_candidates} first />
        {full ? (
          <>
            <Step label="öneri" value={data.proposals ?? 0} />
            <Step label="onay · ret" value={`${fmtInt(data.approvals ?? 0)} · ${fmtInt(data.rejections ?? 0)}`} strong />
          </>
        ) : null}
      </ol>
    </div>
  );
}

function Step({ label, value, first = false, strong = false }: { label: string; value: number | string; first?: boolean; strong?: boolean }) {
  return (
    <li className="flex items-center gap-1.5">
      {first ? null : (
        <svg aria-hidden viewBox="0 0 16 16" className="size-4 text-muted" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
        </svg>
      )}
      <span className={cn("flex min-w-[84px] flex-col rounded-lg px-3 py-1.5", strong ? "bg-brand text-on-dark" : "bg-sunk")}>
        <span className={cn("text-[18px] leading-6 font-semibold tabular-nums", strong ? "text-on-dark" : "text-ink")}>{typeof value === "number" ? fmtInt(value) : value}</span>
        <span className={cn("text-meta", strong ? "text-on-dark/85" : "text-muted")}>{label}</span>
      </span>
    </li>
  );
}
