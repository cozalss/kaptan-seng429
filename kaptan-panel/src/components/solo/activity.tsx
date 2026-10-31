import type { ReactNode } from "react";
import { fmtTime } from "@/lib/format";
import type { ActivityItem, ActivityKind } from "@/lib/solo/activity";
import { dayLabel, fmtLira } from "@/lib/solo/words";
import { cn } from "@/lib/utils";

/** One small line icon per kind: a buy arrives (↙), a sell leaves (↗), a skip (×), a hold (=). */
const ICON: Readonly<Record<ActivityKind, ReactNode>> = {
  bought: <path d="M13 7 7 13M7 8v5h5" />,
  approved_buy: <path d="M13 7 7 13M7 8v5h5" />,
  approved_sell: <path d="M7 13l6-6M8 7h5v5" />,
  skipped: <path d="M7.5 7.5l5 5M12.5 7.5l-5 5" />,
  held: <path d="M6.5 8.5h7M6.5 11.5h7" />,
};
const TINT: Readonly<Record<ActivityKind, string>> = {
  bought: "bg-gain/10 text-gain",
  approved_buy: "bg-gain/10 text-gain",
  approved_sell: "bg-loss/10 text-loss",
  skipped: "bg-sunk text-muted",
  held: "bg-sunk text-ink-soft",
};

/**
 * "Son işlemler": the last few things that happened, as a card of rows — an icon for the kind,
 * what happened ("KRGCL alımını onayladın") over when, and the money on the right.
 */
export function Activity({ items }: { items: readonly ActivityItem[] }) {
  return (
    <section aria-labelledby="son-islemler" className="min-w-0 overflow-clip rounded-2xl border border-line bg-panel shadow-card">
      <header className="border-b border-line px-5 py-4">
        <h2 id="son-islemler" className="text-title font-semibold tracking-[-0.01em] text-ink">
          Son işlemler
        </h2>
      </header>
      {items.length === 0 ? (
        <p className="px-5 py-6 text-ui text-ink-soft">Henüz işlem yok. Bir öneriyi onayladığında burada görünür.</p>
      ) : (
        <ol className="divide-y divide-line" data-testid="son-islemler">
          {items.map((it) => (
            <li key={it.key} className="flex items-center gap-3 px-5 py-3">
              <span aria-hidden className={cn("grid size-8 shrink-0 place-items-center rounded-full", TINT[it.kind])}>
                <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  {ICON[it.kind]}
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ui font-medium text-ink">{it.title}</span>
                <span className="block text-meta text-muted tabular-nums">
                  {dayLabel(it.at)} {fmtTime(it.at)}
                </span>
              </span>
              {it.amount !== null ? <span className="shrink-0 text-ui font-semibold text-ink tabular-nums">{fmtLira(it.amount)}</span> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
