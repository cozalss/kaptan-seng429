import type { DisclosureListItem } from "@/lib/domain";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { shortName } from "@/components/story/plain";
import { titleTr } from "@/components/story/turkish";
import { FATE_LABEL, fateOf, groupByHour, tickerOf, type DisclosureFate } from "./disclosure-logic";

const FATE_TONE: Readonly<Record<DisclosureFate, string>> = {
  // Only what went to the crew is a filled pill; the rest is a quiet word, so the 13 that matter stand out.
  noise: "px-0 font-medium text-muted",
  archived: "px-0 font-medium text-muted",
  processed: "px-2.5 bg-brand text-on-dark",
};

const EVENT_CODES = new Set(["E1", "E2", "E3", "E4"]);

/**
 * KAP disclosures as dense rows: time, ticker, company, subject, and what the desk did with
 * it (elendi · arşivlendi · tayfaya gönderildi). An E1–E4 candidate carries its code. Rows sent
 * to the crew carry an indigo edge and bold names; the rest stay quiet. On a phone each row is
 * two lines (company, subject) with the outcome as a dot.
 */
export function DisclosureRows({ rows, label, compact = false }: { rows: readonly DisclosureListItem[]; label: string; compact?: boolean }) {
  return (
    <ol aria-label={label} className="divide-y divide-line">
      {rows.map((d) => (
        <Row key={d.disclosure_index} d={d} compact={compact} />
      ))}
    </ol>
  );
}

/**
 * The full list, cut by the hour: a sticky band per hour ("13:00–14:00 · 32 bildirim") over
 * that hour's rows, so a long session scans like a timetable.
 */
export function DisclosureHours({ rows, label }: { rows: readonly DisclosureListItem[]; label: string }) {
  const groups = groupByHour(rows);
  return (
    <div role="group" aria-label={label}>
      {groups.map((g) => (
        <section key={`${g.hour}-${g.rows[0]?.disclosure_index}`} aria-label={`${g.label} · ${g.rows.length} bildirim`}>
          <h3 className="sticky top-14 z-10 flex items-center justify-between border-b border-line bg-sunk/95 px-5 py-1.5 text-meta font-semibold text-ink-soft tabular-nums backdrop-blur-sm lg:top-0">
            <span>{g.label}</span>
            <span className="font-medium text-muted">{g.rows.length} bildirim</span>
          </h3>
          <DisclosureRows rows={g.rows} label={`${g.label} bildirimleri`} />
        </section>
      ))}
    </div>
  );
}

function Row({ d, compact }: { d: DisclosureListItem; compact: boolean }) {
  const fate = fateOf(d);
  const ticker = tickerOf(d);
  const code = d.classification && EVENT_CODES.has(d.classification.event_type) ? d.classification.event_type : null;
  const detail = d.summary && d.summary !== d.subject ? d.summary : null;
  const crew = fate === "processed";
  return (
    <li
      data-fate={fate}
      className={cn(
        "relative grid grid-cols-[44px_minmax(0,1fr)_auto] items-start gap-x-3 px-5 py-2.5 sm:grid-cols-[52px_76px_minmax(0,1fr)_auto] sm:items-center sm:gap-x-4",
        crew && "bg-wash-tint/40 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-brand",
        compact ? "sm:py-2.5" : "sm:py-3",
      )}
    >
      <time dateTime={d.published_at} className="pt-0.5 text-dense text-muted tabular-nums sm:pt-0">
        {fmtTime(d.published_at)}
      </time>
      <span className="hidden sm:block">
        {ticker ? <span className="code inline-block rounded-md bg-sunk px-1.5 py-0.5 text-[12px] font-semibold text-ink">{ticker}</span> : null}
      </span>
      <div className="min-w-0">
        <p className="flex min-w-0 items-baseline gap-x-2 text-ui">
          <span className="code shrink-0 text-[12px] font-semibold text-ink sm:hidden">{ticker}</span>
          <span className={cn("min-w-0 truncate", crew ? "font-semibold text-ink" : "font-medium text-ink-soft")}>{titleTr(shortName(d.company_name))}</span>
        </p>
        <p className={cn("truncate text-dense", crew ? "text-ink-soft" : "text-muted")}>
          {d.subject}
          {detail && !compact ? <span className="max-sm:hidden"> · {detail}</span> : null}
        </p>
      </div>
      <span className="flex items-center gap-1.5 pt-1.5 sm:hidden">
        {code ? <Code code={code} /> : null}
        <span aria-hidden className={cn("size-2.5 rounded-full", crew ? "bg-brand" : fate === "archived" ? "bg-line-strong" : "border border-rule-soft")} />
        <span className="sr-only">{FATE_LABEL[fate]}</span>
      </span>
      <p className="hidden items-center justify-end gap-2 sm:flex">
        {code ? <Code code={code} /> : null}
        <Fate fate={fate} />
      </p>
    </li>
  );
}

function Fate({ fate }: { fate: DisclosureFate }) {
  return <span className={cn("rounded-full text-meta leading-[22px] font-semibold whitespace-nowrap", FATE_TONE[fate])}>{FATE_LABEL[fate]}</span>;
}

function Code({ code }: { code: string }) {
  return (
    <span title="Olay adayı" className="code rounded-md border border-rule-soft px-1.5 text-[12px] leading-5 font-semibold text-ink">
      {code}
    </span>
  );
}
