import Link from "next/link";
import type { RiskStatus } from "@/lib/domain";
import { fmtInt, fmtTime } from "@/lib/format";
import { ROUTES } from "@/lib/nav";

/** What the crew looked at while nothing reached a proposal (today's counters or the last session's). */
export interface CalmFacts {
  read: number;
  /** The read count is a capped list ("500+"). */
  capped?: boolean;
  toCrew: number;
  candidates: number;
  /** "bugün" or "30 Ekim Cuma" */
  when: string;
  /** The market is closed today: when the next session is ("2 Kasım Pazartesi"). */
  nextSession?: string | null;
}

/**
 * The two days without a list. The empty day is a result, not a hole: what the crew read,
 * how many went on to it, how many were candidates, and that none passed the bar; then when
 * the next one can come. The stopped day says what Durdur did and where the two-person
 * restart lives, under a north-red rule.
 */
export function CalmDay({ facts = null }: { facts?: CalmFacts | null }) {
  return (
    <section aria-label="Bekleyen öneri yok" className="animate-fade-in border-t border-line px-5 py-8 sm:py-10">
      <div className="mx-auto flex max-w-[620px] flex-col items-center text-center">
        <span aria-hidden className="grid size-12 place-items-center rounded-full bg-wash-tint text-brand">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 5.5l1.6 6.5h-3.2z" fill="currentColor" />
            <path d="M10.4 12 12 18.5 13.6 12" />
          </svg>
        </span>
        <p className="mt-3 text-body font-semibold text-ink">Bekleyen öneri yok — tayfa izliyor.</p>
        {facts ? (
          <>
            <p className="mt-4 text-meta font-medium tracking-[0.08em] text-muted uppercase">{facts.when === "bugün" ? "Bugün" : `${facts.when} seansı`}</p>
            <dl className="mt-2 grid w-full grid-cols-3 divide-x divide-line rounded-xl border border-line bg-paper/60 py-3">
              <Fact label="okunan bildirim" value={facts.read} plus={facts.capped} />
              <Fact label="tayfaya giden" value={facts.toCrew} />
              <Fact label="olay adayı" value={facts.candidates} />
            </dl>
            <p className="mt-4 max-w-[56ch] text-ui text-ink-soft">
              Hiçbiri öneri eşiğini geçmedi.{facts.nextSession ? ` Piyasa kapalı; sıradaki seans ${facts.nextSession}.` : ""}
            </p>
          </>
        ) : null}
        <p className="mt-1 max-w-[56ch] text-ui text-ink-soft">Yeni bir öneri çıkınca burada görünür; sayfayı yenilemen gerekmez.</p>
      </div>
    </section>
  );
}

function Fact({ label, value, plus = false }: { label: string; value: number; plus?: boolean }) {
  return (
    <div className="px-2">
      <dt className="text-meta text-muted">{label}</dt>
      <dd className="text-[22px] leading-8 font-semibold text-ink tabular-nums">
        {fmtInt(value)}
        {plus ? "+" : ""}
      </dd>
    </div>
  );
}

export function StoppedDay({ risk }: { risk: RiskStatus }) {
  const bySystem = risk.kill_by?.startsWith("system:") ?? false;
  const when = risk.kill_at ? ` (${fmtTime(risk.kill_at)})` : "";
  return (
    <section aria-label="Durdurma" className="animate-fade-in border-t-4 border-north bg-north-tint/60 px-5 py-6">
      <p className="text-ui font-semibold text-ink">
        {bySystem ? `Risk izleyici zirveden −%5’te kendiliğinden durdurdu${when}.` : `Masa elle durduruldu${when}.`}
        {risk.kill_reason && !bySystem ? <span className="font-normal text-ink-soft"> Gerekçe: “{risk.kill_reason}”</span> : null}
      </p>
      <p className="mt-2 max-w-[60ch] text-ui text-ink-soft">
        Bekleyen öneriler düştü, açık emirler iptal edildi; pozisyonlar satılmadı. Yeniden başlatmayı Yönetici başlatır, Risk Sorumlusu onaylar.
      </p>
      <Link href={ROUTES.portfoy} className="group mt-4 inline-flex min-h-11 items-center gap-1.5 text-ui font-semibold text-brand sm:min-h-0">
        <span className="underline decoration-rule-ui underline-offset-4 group-hover:decoration-brand">Yeniden başlatma Portföy’de</span>
        <span aria-hidden className="transition-transform duration-[var(--dur-quick)] ease-[var(--ease-ink)] group-hover:translate-x-1">
          →
        </span>
      </Link>
    </section>
  );
}
