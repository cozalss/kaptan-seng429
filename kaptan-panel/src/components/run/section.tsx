import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SkeletonLines } from "@/components/ui/primitives";
import type { Tone } from "./labels";

/**
 * One dossier section of "Neden bu işlem?": a numbered sheet (§n) with an anchor for the
 * table of contents, a one-line meta, and an optional stamp. While a live run has not reached
 * the section's node it shows a ruled placeholder instead of data it has not produced yet.
 */
export function Section({
  id,
  num,
  title,
  meta,
  stamp,
  actions,
  pending,
  tone = "panel",
  children,
  className,
}: {
  id: string;
  num: string;
  title: ReactNode;
  meta?: ReactNode;
  stamp?: ReactNode;
  actions?: ReactNode;
  /** Live run: the node behind this section has not finished yet. */
  pending?: string | null;
  tone?: "panel" | "critical";
  children: ReactNode;
  className?: string;
}) {
  const headingId = `${id}-baslik`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("scroll-mt-24 border-[1.5px] bg-panel", tone === "critical" ? "border-north" : "border-ink", className)}
    >
      <header className={cn("flex flex-wrap items-start gap-x-3 gap-y-2 border-b px-4 py-3", tone === "critical" ? "border-north/40" : "border-hairline")}>
        <span className="code mt-0.5 w-7 shrink-0 text-muted" aria-hidden>
          §{num}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="text-[15px] leading-5 font-medium text-ink">
            {title}
          </h2>
          {meta ? <p className="mt-0.5 text-meta text-muted">{meta}</p> : null}
        </div>
        {stamp || actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {stamp}
            {actions}
          </div>
        ) : null}
      </header>
      <div className="p-4">
        {pending ? (
          <div className="space-y-3" aria-busy="true">
            <p className="flex items-center gap-2 text-dense text-wash">
              <span aria-hidden className="inline-block size-2 animate-pulse-dot bg-wash" />
              {pending}
            </p>
            <SkeletonLines lines={3} />
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

const TONE_CLASS: Readonly<Record<Tone, "ink" | "wash" | "north" | "muted" | "outline">> = {
  ink: "ink",
  wash: "wash",
  north: "north",
  muted: "muted",
  outline: "outline",
};

export function ToneBadge({ tone, children, title, className }: { tone: Tone; children: ReactNode; title?: string; className?: string }) {
  return (
    <Badge tone={TONE_CLASS[tone]} title={title} className={className}>
      {children}
    </Badge>
  );
}

/** A ledger of label → value rows (dense, two columns, wraps to one on phones). */
export function Ledger({ rows, className }: { rows: ReadonlyArray<{ k: ReactNode; v: ReactNode; hint?: ReactNode } | null | undefined | false>; className?: string }) {
  const list = rows.filter((r): r is { k: ReactNode; v: ReactNode; hint?: ReactNode } => Boolean(r));
  return (
    <dl className={cn("grid grid-cols-1 border-t border-hairline sm:grid-cols-[minmax(150px,auto)_1fr]", className)}>
      {list.map((r, i) => (
        <div key={i} className="contents">
          <dt className="border-b border-hairline pt-2 text-meta text-muted sm:py-2 sm:pr-4">{r.k}</dt>
          <dd className="border-b border-hairline pb-2 text-dense text-ink sm:py-2">
            {r.v}
            {r.hint ? <span className="ml-2 text-meta text-muted">{r.hint}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** When a node did not run, say so plainly (and why, if the verdict knows). */
export function NotRun({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-dense text-ink-soft">
      <span aria-hidden className="mt-1 inline-block h-px w-4 shrink-0 bg-rule-soft" />
      <span>{children}</span>
    </p>
  );
}

/** Confidence / score meter with the threshold tick (e.g. classifier 0,80, guard 0,90). */
export function Meter({
  value,
  threshold,
  label,
  tone = "ink",
  marks,
}: {
  value: number;
  threshold?: number;
  label: string;
  tone?: "ink" | "north" | "wash";
  marks?: ReadonlyArray<{ at: number; label: string }>;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fill = tone === "north" ? "bg-north" : tone === "wash" ? "bg-wash" : "bg-ink";
  const ticks = marks ?? (threshold !== undefined ? [{ at: threshold, label: `eşik ${threshold.toFixed(2).replace(".", ",")}` }] : []);
  return (
    <div className="w-full">
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={value}
        className="relative h-3 border border-ink bg-sunk"
      >
        <div className={cn("h-full", fill)} style={{ width: `${pct}%` }} />
        {ticks.map((t) => (
          <span key={t.at} aria-hidden className="absolute -top-1 -bottom-1 w-[2px] bg-ink" style={{ left: `calc(${t.at * 100}% - 1px)` }} />
        ))}
      </div>
      {ticks.length ? (
        <div className="relative mt-1 h-4 text-meta text-muted">
          {ticks.map((t) => (
            <span key={t.at} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${t.at * 100}%` }}>
              {t.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
