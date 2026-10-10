import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The few typographic pieces every screen shares: a small kicker line, the one big Bodoni
 * sentence, a story section with its quiet label, and two tiny tags (E-code, "örnek değer").
 */
export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[13px] tracking-[0.01em] text-muted", className)}>{children}</p>;
}

export function BigSentence({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <h1 id={id} className={cn("font-display text-[38px] leading-[1.06] tracking-[-0.015em] text-balance text-ink sm:text-[52px]", className)}>
      {children}
    </h1>
  );
}

export function Lead({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[17px] leading-[26px] text-ink-soft", className)}>{children}</p>;
}

/** A chapter of the story: a short question as its label, then one or two sentences. */
export function StorySection({ label, children, aside, className }: { label: string; children: ReactNode; aside?: ReactNode; className?: string }) {
  const id = `bolum-${label.toLocaleLowerCase("tr-TR").replace(/[^a-zçğıöşü0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
  return (
    <section aria-labelledby={id} className={cn("grid gap-3 sm:grid-cols-[148px_minmax(0,1fr)] sm:gap-8", className)}>
      <div className="flex items-baseline gap-2 sm:block">
        <h2 id={id} className="text-[13px] font-medium tracking-[0.04em] text-ink uppercase">
          {label}
        </h2>
        {aside ? <div className="sm:mt-1.5">{aside}</div> : null}
      </div>
      <div className="min-w-0 text-[17px] leading-[27px] text-ink">{children}</div>
    </section>
  );
}

/** "E3" — the code is only ever a tiny tag; the words carry the meaning. */
export function CodeTag({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span title={title} className="code inline-block border border-rule-soft px-1 text-[11px] leading-[16px] text-ink-soft">
      {children}
    </span>
  );
}

export function SampleTag({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-[12px] whitespace-nowrap text-muted", className)} title="Örnek veri: gerçek sonuç değil">
      <span aria-hidden className="inline-block size-[5px] rotate-45 border border-muted" />
      örnek değer
    </span>
  );
}

/** A thin ink rule with a centred diamond — the one ornament between chapters. */
export function Fleuron({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("flex items-center gap-3 text-rule-soft", className)}>
      <span className="h-px flex-1 bg-hairline" />
      <span className="inline-block size-[6px] rotate-45 border border-current" />
      <span className="h-px flex-1 bg-hairline" />
    </div>
  );
}
