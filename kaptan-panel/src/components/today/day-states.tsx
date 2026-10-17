import Link from "next/link";
import type { RiskStatus } from "@/lib/domain";
import { fmtTime } from "@/lib/format";
import { ROUTES } from "@/lib/nav";

/**
 * The two days without a list. The empty day says what happens next in one sentence; the
 * stopped day says what Durdur did and where the two-person restart lives, under a north-red rule.
 */
export function CalmDay() {
  return (
    <section aria-label="Bekleyen öneri yok" className="animate-fade-in border-2 border-ink bg-panel px-4 py-8 sm:px-6">
      <p className="text-body font-semibold text-ink">Bekleyen öneri yok.</p>
      <p className="mt-1 max-w-[56ch] text-ui text-ink-soft">Yeni bir öneri çıkınca burada görünür; sayfayı yenilemen gerekmez.</p>
    </section>
  );
}

export function StoppedDay({ risk }: { risk: RiskStatus }) {
  const bySystem = risk.kill_by?.startsWith("system:") ?? false;
  const when = risk.kill_at ? ` (${fmtTime(risk.kill_at)})` : "";
  return (
    <section aria-label="Durdurma" className="animate-fade-in border-2 border-t-4 border-ink border-t-north bg-panel px-4 py-6 sm:px-6">
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
