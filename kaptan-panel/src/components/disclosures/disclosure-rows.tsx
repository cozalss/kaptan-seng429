import type { DisclosureListItem } from "@/lib/domain";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { shortName } from "@/components/story/plain";
import { titleTr } from "@/components/story/turkish";
import { FATE_LABEL, fateOf, tickerOf, type DisclosureFate } from "./disclosure-logic";

const FATE_TONE: Readonly<Record<DisclosureFate, string>> = {
  noise: "bg-sunk text-ink-soft",
  archived: "bg-wash-tint text-brand",
  processed: "bg-brand text-on-dark",
};

const EVENT_CODES = new Set(["E1", "E2", "E3", "E4"]);

/**
 * KAP disclosures as dense rows: time, ticker, company, subject, and what the desk did with
 * it (elendi · arşivlendi · tayfaya gönderildi). An E1–E4 candidate carries its code.
 */
export function DisclosureRows({ rows, label, compact = false }: { rows: readonly DisclosureListItem[]; label: string; compact?: boolean }) {
  return (
    <ol aria-label={label} className="divide-y divide-line">
      {rows.map((d) => {
        const fate = fateOf(d);
        const ticker = tickerOf(d);
        const code = d.classification && EVENT_CODES.has(d.classification.event_type) ? d.classification.event_type : null;
        const detail = d.summary && d.summary !== d.subject ? d.summary : null;
        return (
          <li
            key={d.disclosure_index}
            className={cn("grid grid-cols-[44px_minmax(0,1fr)] items-start gap-x-3 px-5 py-3 sm:grid-cols-[52px_76px_minmax(0,1fr)_auto] sm:items-center sm:gap-x-4", compact ? "sm:py-2.5" : "sm:py-3")}
          >
            <time dateTime={d.published_at} className="pt-0.5 text-dense text-muted tabular-nums sm:pt-0">
              {fmtTime(d.published_at)}
            </time>
            <span className="hidden sm:block">
              {ticker ? <span className="code inline-block rounded-md bg-sunk px-1.5 py-0.5 text-[12px] font-semibold text-ink">{ticker}</span> : null}
            </span>
            <div className="min-w-0">
              <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-ui">
                <span className="code text-[12px] font-semibold text-ink sm:hidden">{ticker}</span>
                <span className="min-w-0 truncate font-semibold text-ink">{titleTr(shortName(d.company_name))}</span>
              </p>
              <p className="truncate text-dense text-ink-soft">
                {d.subject}
                {detail && !compact ? <span className="text-muted"> · {detail}</span> : null}
              </p>
              <p className="mt-1 flex items-center gap-2 sm:hidden">
                <Fate fate={fate} />
                {code ? <Code code={code} /> : null}
              </p>
            </div>
            <p className="hidden items-center justify-end gap-2 sm:flex">
              {code ? <Code code={code} /> : null}
              <Fate fate={fate} />
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function Fate({ fate }: { fate: DisclosureFate }) {
  return <span className={cn("rounded-full px-2.5 text-meta leading-[22px] font-semibold whitespace-nowrap", FATE_TONE[fate])}>{FATE_LABEL[fate]}</span>;
}

function Code({ code }: { code: string }) {
  return (
    <span title="Olay adayı" className="code rounded-md border border-rule-soft px-1.5 text-[12px] leading-5 font-semibold text-ink">
      {code}
    </span>
  );
}
