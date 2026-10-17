import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { withNums } from "./num";

/**
 * The few typographic pieces every screen shares: a small kicker line, the one big Bodoni
 * sentence, a story section with its quiet label, and two tiny tags (E-code, "örnek değer").
 */
export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-dense tracking-[0.01em] text-muted", className)}>{children}</p>;
}

/**
 * The one big Bodoni sentence of a screen. Figures in a plain-string sentence are set in
 * tabular Inter (withNums). `focusTarget` makes it the place focus lands after a route change
 * (shell/app-shell.tsx), so a screen reader starts reading at the sentence.
 */
export function BigSentence({
  children,
  className,
  id,
  as: Tag = "h1",
  focusTarget = false,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  as?: "h1" | "p";
  focusTarget?: boolean;
}) {
  return (
    <Tag
      id={id}
      tabIndex={focusTarget ? -1 : undefined}
      data-route-focus={focusTarget ? "" : undefined}
      className={cn(
        "font-display text-display tracking-[-0.015em] text-balance text-ink sm:text-display-lg",
        focusTarget && "outline-none",
        className,
      )}
    >
      {typeof children === "string" ? withNums(children) : children}
    </Tag>
  );
}

export function Lead({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-body text-ink-soft", className)}>{children}</p>;
}

/** A chapter of the story: a short question as its label, then one or two sentences. */
export function StorySection({ label, children, aside, className }: { label: string; children: ReactNode; aside?: ReactNode; className?: string }) {
  const id = `bolum-${label.toLocaleLowerCase("tr-TR").replace(/[^a-zçğıöşü0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
  return (
    <section aria-labelledby={id} className={cn("grid gap-3 sm:grid-cols-[148px_minmax(0,1fr)] sm:gap-8", className)}>
      <div className="flex items-baseline gap-2 sm:block sm:pt-[5px]">
        <h2 id={id} className="label">
          {label}
        </h2>
        {aside ? <div className="sm:mt-1.5">{aside}</div> : null}
      </div>
      <div className="min-w-0 space-y-4 text-body text-ink">{children}</div>
    </section>
  );
}

/** "E3" — the code is only ever a tiny tag; the words carry the meaning. */
export function CodeTag({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span title={title} className="code inline-block border border-rule-soft px-1 text-meta text-ink-soft">
      {children}
    </span>
  );
}

/** "örnek değer": a dotted underline says "this figure is an example", no ornament. */
export function SampleTag({ className }: { className?: string }) {
  return (
    <span
      className={cn("text-meta whitespace-nowrap text-muted underline decoration-muted decoration-dotted underline-offset-[3px]", className)}
      title="Örnek veri: gerçek sonuç değil"
    >
      örnek değer
    </span>
  );
}

/** A thin rule with a centred diamond — the one ornament, between the parts of a screen. */
export function Fleuron({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("my-[72px] flex items-center gap-3 text-rule-soft", className)}>
      <span className="h-px flex-1 bg-hairline" />
      <span className="inline-block size-[6px] rotate-45 border border-current" />
      <span className="h-px flex-1 bg-hairline" />
    </div>
  );
}
