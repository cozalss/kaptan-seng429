import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Keyboard key. */
export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-grid h-5 min-w-5 place-items-center border border-rule-soft border-b-2 bg-panel px-1 font-sans text-[11px] leading-none font-medium text-ink-soft",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Skeleton: a ruled placeholder with a slow sweep (static under reduced motion). Rendered as
 * a block-level <span> so it is valid anywhere, including inside <p> and header text slots.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-hidden
      className={cn(
        "block bg-[linear-gradient(90deg,var(--sunk)_0%,var(--sunk)_40%,#f6f4ef_50%,var(--sunk)_60%,var(--sunk)_100%)] bg-[length:200%_100%] [animation:skeleton-sweep_1.6s_linear_infinite]",
        className,
      )}
      {...props}
    />
  );
}

/** Lines of skeleton text, widths varied so it reads as type, not bars. */
export function SkeletonLines({ lines = 3, className }: { lines?: number; className?: string }) {
  const widths = ["w-11/12", "w-9/12", "w-10/12", "w-7/12", "w-8/12"];
  return (
    <div className={cn("space-y-2", className)} role="status" aria-label="Yükleniyor">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3", widths[i % widths.length])} />
      ))}
    </div>
  );
}

/**
 * Stat: a big Bodoni numeral with an Inter label. Use for the 1–3 numbers a screen is
 * about (counters, equity, drawdown) — never a row of six.
 */
export function Stat({
  label,
  value,
  unit,
  hint,
  tone = "ink",
  size = "md",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  hint?: ReactNode;
  tone?: "ink" | "north" | "wash" | "muted";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-meta text-muted">{label}</div>
      <div
        className={cn(
          "font-display pt-[0.14em] pb-[0.06em] leading-none tracking-[-0.02em] tabular-nums",
          size === "sm" && "mt-0.5 text-[28px]",
          size === "md" && "mt-1 text-[40px]",
          size === "lg" && "mt-1 text-[56px]",
          tone === "ink" && "text-ink",
          tone === "north" && "text-north",
          tone === "wash" && "text-wash",
          tone === "muted" && "text-muted",
        )}
      >
        {typeof value === "string" ? <Numeral text={value} /> : value}
        {unit ? <span className="ml-1 font-sans text-[13px] tracking-normal text-muted">{unit}</span> : null}
      </div>
      {hint ? <div className="mt-1.5 text-meta text-muted">{hint}</div> : null}
    </div>
  );
}

/**
 * Bodoni's display "%" and sign glyphs read as ornaments at large sizes; set them in Inter
 * so "−%5,2" stays legible while the digits keep the Bodoni voice.
 */
export function Numeral({ text }: { text: string }) {
  const parts = text.split(/([%+−-])/);
  return (
    <>
      {parts.map((p, i) =>
        /^[%+−-]$/.test(p) ? (
          <span key={i} className="mx-[0.04em] align-[0.12em] font-sans text-[0.62em] font-normal">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
}

/**
 * Empty state: what this is, why it is empty, what to do next. A small compass rose as the
 * one hand-drawn touch.
 */
export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-3 px-6 py-10", className)}>
      <svg aria-hidden width="36" height="36" viewBox="0 0 36 36" className="text-rule-soft">
        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 3" />
        <path d="M18 5 20.4 18H15.6Z" fill="var(--ink)" opacity="0.75" />
        <path d="M15.6 18 18 31 20.4 18" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      <div>
        <p className="font-display text-[22px] leading-tight text-ink">{title}</p>
        {body ? <p className="mt-1.5 max-w-prose text-ui text-ink-soft">{body}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Error box inside a panel: user-safe message + retry. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 border-l-[3px] border-north bg-north-tint px-4 py-3 text-ui">
      <span className="font-medium text-north">Yüklenemedi.</span>
      <span className="text-ink-soft">{message}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="ml-auto text-dense font-medium text-ink underline underline-offset-4 hover:text-wash">
          Yeniden dene
        </button>
      ) : null}
    </div>
  );
}

/** Page title in Bodoni caps with a meta line and actions; one per screen. */
export function PageHeader({
  title,
  kicker,
  meta,
  actions,
  className,
}: {
  title: ReactNode;
  kicker?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end gap-x-6 gap-y-3 border-b-[1.5px] border-ink pb-4", className)}>
      <div className="min-w-[min(100%,440px)] flex-1">
        {kicker ? <div className="mb-3.5 text-meta text-muted">{kicker}</div> : null}
        <h1 className="title-display text-[34px] text-ink sm:text-[44px]">{title}</h1>
        {meta ? <div className="mt-2 text-ui text-ink-soft">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** "örnek değer · gerçek sonuç değil" marker for sample numbers. */
export function SampleNote({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-meta text-muted", className)}>
      <span aria-hidden className="inline-block size-1.5 rotate-45 border border-muted" />
      örnek değer · gerçek sonuç değil
    </span>
  );
}

/** "LLM üretimi, doğrulanmamış" marker for generated text (09 §10.1). */
export function LlmNote({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-meta text-muted", className)}>
      <span aria-hidden className="inline-block h-px w-3 bg-muted" />
      LLM üretimi, doğrulanmamış
    </span>
  );
}
