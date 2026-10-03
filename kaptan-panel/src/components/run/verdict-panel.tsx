import { cn } from "@/lib/utils";
import { Numeral } from "@/components/ui/primitives";
import { DisplayText } from "./display-text";
import type { KeyFact, Stage, StageState, Verdict } from "./verdict";

/**
 * The jury's first read (FRONTEND-SPEC §2.4, 11 §2): a stamped one-sentence verdict, the
 * path "Bildirim → ön eleme → 6 ajan → kural → risk kapısı → insan onayı → dolum" with
 * where this run stopped, and the 1–4 numbers the run is about. Every stage links down.
 */
const STAMP_TONE: Readonly<Record<Verdict["tone"], string>> = {
  ok: "border-ink bg-ink text-on-dark",
  wait: "border-wash bg-wash text-on-dark",
  live: "border-wash bg-wash-tint text-wash",
  veto: "border-north bg-north text-on-dark",
  stop: "border-ink bg-panel text-ink",
  neutral: "border-rule-soft bg-sunk text-ink-soft",
};

const MARK: Readonly<Record<StageState, { glyph: string; cls: string; sr: string }>> = {
  pass: { glyph: "✓", cls: "border-ink bg-panel text-ink", sr: "geçti" },
  veto: { glyph: "✗", cls: "border-north bg-north text-on-dark", sr: "veto" },
  stop: { glyph: "✗", cls: "border-ink bg-ink text-on-dark", sr: "durdu" },
  wait: { glyph: "◐", cls: "border-wash bg-wash text-on-dark", sr: "bekliyor" },
  running: { glyph: "●", cls: "border-wash bg-wash-tint text-wash animate-pulse-dot", sr: "çalışıyor" },
  pending: { glyph: "", cls: "border-dashed border-rule-soft bg-transparent text-muted", sr: "ulaşılmadı" },
  skip: { glyph: "–", cls: "border-rule-soft bg-sunk text-muted", sr: "atlandı" },
};

function StageItem({ s, i, last }: { s: Stage; i: number; last: boolean }) {
  const m = MARK[s.state];
  const reached = s.state !== "pending";
  return (
    <li className="relative flex min-w-[96px] flex-1 basis-0 flex-col">
      <a
        href={`#${s.anchor}`}
        className="group flex flex-col gap-1.5 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <span className="flex items-center">
          <span aria-hidden className={cn("relative z-10 grid size-7 shrink-0 place-items-center border-[1.5px] text-[13px] leading-none font-semibold", m.cls)}>
            {m.glyph || <span className="text-meta">{i + 1}</span>}
          </span>
          {last ? null : (
            <span
              aria-hidden
              className={cn("h-[1.5px] flex-1", reached && s.state !== "veto" && s.state !== "stop" ? "bg-ink" : "border-t-[1.5px] border-dashed border-rule-soft bg-transparent")}
            />
          )}
        </span>
        <span className={cn("pr-2 text-dense leading-4 font-medium group-hover:underline group-hover:underline-offset-4", reached ? "text-ink" : "text-muted", s.state === "veto" && "text-north")}>
          {s.label}
        </span>
        <span className={cn("pr-2 text-meta leading-4", s.state === "veto" ? "text-north" : "text-muted")}>
          <span className="sr-only">{m.sr}: </span>
          {s.note}
        </span>
      </a>
    </li>
  );
}

export function PathRail({ stages }: { stages: readonly Stage[] }) {
  return (
    <nav aria-label="Karar yolu">
      <ol className="flex gap-0 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {stages.map((s, i) => (
          <StageItem key={s.key} s={s} i={i} last={i === stages.length - 1} />
        ))}
      </ol>
    </nav>
  );
}

export function VerdictPanel({ verdict, facts }: { verdict: Verdict; facts: readonly KeyFact[] }) {
  const critical = verdict.tone === "veto";
  return (
    <section
      aria-labelledby="hukum-baslik"
      className={cn("relative border-[1.5px] bg-panel shadow-ink-lg", critical ? "border-north shadow-[6px_6px_0_var(--north)]" : "border-ink")}
    >
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 px-5 pt-5 pb-4 sm:px-6">
          <h2 id="hukum-baslik" className="sr-only">
            Hüküm
          </h2>
          <p className={cn("inline-flex items-center gap-2 border-[1.5px] px-2 py-0.5 text-dense font-medium", STAMP_TONE[verdict.tone])}>
            {verdict.tone === "live" ? <span aria-hidden className="inline-block size-2 animate-pulse-dot bg-wash" /> : null}
            {verdict.stamp}
          </p>
          <p aria-live={verdict.tone === "live" ? "polite" : undefined} className="mt-3 max-w-[64ch] font-display text-[22px] leading-[1.22] text-ink sm:text-[26px]">
            <DisplayText text={verdict.sentence} />
          </p>
        </div>
        {facts.length ? (
          <dl className="grid grid-cols-2 border-t border-hairline lg:w-[300px] lg:grid-cols-1 lg:border-t-0 lg:border-l xl:w-[340px] xl:grid-cols-2">
            {facts.map((f, i) => (
              <div key={f.label} className={cn("min-w-0 border-hairline px-5 py-3", i % 2 === 1 && "border-l lg:border-l-0 xl:border-l", i >= 2 && "border-t", "lg:border-t xl:[&:nth-child(-n+2)]:border-t-0 lg:first:border-t-0")}>
                <dt className="text-meta text-muted">{f.label}</dt>
                <dd
                  className={cn(
                    "mt-1 font-display text-[30px] leading-none tracking-[-0.02em] tabular-nums",
                    f.tone === "north" ? "text-north" : f.tone === "wash" ? "text-wash" : f.tone === "muted" ? "text-muted" : "text-ink",
                  )}
                >
                  <Numeral text={f.value} />
                </dd>
                {f.hint ? <dd className="mt-1 text-meta text-muted">{f.hint}</dd> : null}
              </div>
            ))}
          </dl>
        ) : null}
      </div>
      <div className="border-t-[1.5px] border-ink bg-paper px-5 py-3 sm:px-6">
        <PathRail stages={verdict.stages} />
      </div>
    </section>
  );
}
