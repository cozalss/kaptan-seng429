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

function Body({ data }: { data: FlowData }) {
  const total = Math.max(1, data.noise + data.archived + data.processed);
  const full = data.proposals !== undefined;
  return (
    <div className="grid flex-1 gap-x-8 gap-y-4 px-5 pb-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)] lg:items-center lg:py-5">
      <div className="min-w-0">
        <p className="flex items-baseline gap-2">
          <span className="text-[30px] leading-9 font-semibold tracking-[-0.02em] text-ink tabular-nums">
            {fmtInt(data.total)}
            {data.capped ? "+" : ""}
          </span>
          <span className="text-ui text-ink-soft">bildirim okundu</span>
        </p>
        <div aria-hidden className="mt-4 flex h-3 gap-[2px] overflow-hidden rounded-full bg-sunk">
          {SEGMENTS.map((s) => {
            const n = data[s.key];
            if (n <= 0) return null;
            return <span key={s.key} className={cn("h-full min-w-1.5 first:rounded-l-full last:rounded-r-full", s.swatch)} style={{ flexGrow: n / total, flexBasis: 0 }} />;
          })}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-dense">
          {SEGMENTS.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-ink-soft">
              <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", s.swatch)} />
              <span className="font-semibold text-ink tabular-nums">{fmtInt(data[s.key])}</span>
              {s.label}
            </li>
          ))}
        </ul>
      </div>
      <dl aria-label="Tayfadan sonra" className={cn("grid divide-x divide-line rounded-lg bg-sunk/60 py-3 text-center", full ? "grid-cols-3" : "grid-cols-1")}>
        <Step label="olay adayı" value={data.e_candidates} />
        {full ? (
          <>
            <Step label="öneri" value={data.proposals ?? 0} />
            <Step label="onay · ret" value={`${fmtInt(data.approvals ?? 0)} · ${fmtInt(data.rejections ?? 0)}`} />
          </>
        ) : null}
      </dl>
    </div>
  );
}

function Step({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="px-2">
      <dt className="text-meta text-muted">{label}</dt>
      <dd className="text-body font-semibold text-ink tabular-nums">{typeof value === "number" ? fmtInt(value) : value}</dd>
    </div>
  );
}
