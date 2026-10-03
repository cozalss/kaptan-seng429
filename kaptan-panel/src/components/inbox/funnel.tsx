import type { DayCounters } from "@/lib/domain";
import { fmtInt, fmtPct, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { funnelBarPct, funnelStages, llmCostLabel, stageConversions } from "./inbox-logic";

/**
 * Pipeline funnel (08 §8.1 #1, US-43): gelen → elenen (LLM'siz) → sınıflanan → E-adayı →
 * risk kapısı → onay → dolum. Bars share one baseline and touch, so the day reads as a
 * staircase of ink; the LLM-free exit is hatched, not filled — it left the pipeline.
 */
export function Funnel({ counters, filled, live }: { counters: DayCounters; filled: number; live: boolean }) {
  const stages = funnelStages(counters, filled);
  const total = counters.total;
  const convs = stageConversions(stages);
  return (
    <section aria-labelledby="funnel-title" className="border-[1.5px] border-ink bg-panel">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline px-4 py-2.5">
        <h2 id="funnel-title" className="text-[15px] font-medium text-ink">
          Hat hunisi
        </h2>
        <p className="text-meta text-muted">
          Bugün {fmtTime(counters.as_of)} itibarıyla{live ? " · canlı" : ""} · elenenler için LLM çağrısı yapılmaz
        </p>
        <LlmCostBadge counters={counters} className="ml-auto" />
      </header>
      <ol className="relative grid auto-cols-[minmax(112px,1fr)] grid-flow-col gap-px overflow-x-auto bg-hairline lg:grid-flow-row lg:grid-cols-7">
        {stages.map((s, i) => {
          const conv = convs[i] ?? null;
          const pct = funnelBarPct(s.value, total);
          return (
            <li key={s.key} className="relative flex min-w-0 flex-col justify-end bg-panel">
              <div className="px-3 pt-2.5">
                <div className={cn("text-meta", s.exit ? "text-muted" : "text-ink-soft")}>{s.label}</div>
                <div
                  className={cn("font-display pt-[0.12em] text-[30px] leading-none tracking-[-0.02em] tabular-nums", s.exit ? "text-ink-soft" : "text-ink")}
                  aria-describedby={`funnel-hint-${s.key}`}
                >
                  {fmtInt(s.value)}
                </div>
                <div className="mt-1 flex min-h-4 items-center gap-1 text-meta text-muted">
                  {conv !== null ? (
                    <span>
                      {s.exit ? "gelenin " : "→ "}
                      {fmtPct(conv, 0)}
                    </span>
                  ) : (
                    <span>tümü</span>
                  )}
                </div>
                <p id={`funnel-hint-${s.key}`} className="sr-only">
                  {s.hint}
                </p>
              </div>
              <div className="mt-2 flex h-12 items-end" aria-hidden>
                <div
                  className={cn("animate-ink-in w-full", s.exit ? "border-t-[1.5px] border-ink-soft" : "bg-ink")}
                  style={{
                    height: `${pct}%`,
                    animationDelay: `${i * 60}ms`,
                    backgroundImage: s.exit ? "repeating-linear-gradient(135deg, var(--ink-soft) 0 1px, transparent 1px 6px)" : undefined,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** "LLM maliyeti · Bugün: 31 çağrı · ~0,4M token" (11 Adım 1). */
export function LlmCostBadge({ counters, className }: { counters: Pick<DayCounters, "llm_calls" | "llm_tokens">; className?: string }) {
  return (
    <span
      className={cn("inline-flex h-7 items-center gap-2 border border-ink bg-paper px-2 text-dense text-ink whitespace-nowrap", className)}
      title="Bugünkü LLM çağrısı ve token toplamı (ön elemede elenenler 0 çağrı)"
    >
      <span className="text-meta text-muted">LLM maliyeti</span>
      <span className="font-medium tabular-nums">{llmCostLabel(counters)}</span>
    </span>
  );
}
