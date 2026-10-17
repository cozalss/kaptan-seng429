import Link from "next/link";
import type { RiskStatus } from "@/lib/domain";
import { fmtTime } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { CalmSea } from "@/app/login/calm-sea";

/**
 * The two days without a list. The empty day is the calm sea from the doors, held still, with
 * one sentence on what happens next. The stopped day says what Durdur did and where the
 * two-person restart lives, under one north-red rule.
 */
export function CalmDay() {
  return (
    <section aria-label="Bekleyen öneri yok" className="animate-fade-in border-y-2 border-ink">
      <CalmSea still className="relative h-[120px] w-full" />
      <p className="max-w-[56ch] py-5 text-ui text-ink-soft">
        Tayfa bildirimleri okumayı sürdürüyor. Bir öneri çıkarsa burada belirir; sayfayı yenilemen gerekmez.
      </p>
    </section>
  );
}

export function StoppedDay({ risk }: { risk: RiskStatus }) {
  const bySystem = risk.kill_by?.startsWith("system:") ?? false;
  const when = risk.kill_at ? ` (${fmtTime(risk.kill_at)})` : "";
  return (
    <section aria-label="Durdurma" className="animate-fade-in border-t-[3px] border-north border-b-2 border-b-ink py-6">
      <p className="text-ui text-ink">
        {bySystem ? `Risk izleyici zirveden −%5’te kendiliğinden durdurdu${when}.` : `Masa elle durduruldu${when}.`}
        {risk.kill_reason && !bySystem ? <span className="text-ink-soft"> Gerekçe: “{risk.kill_reason}”</span> : null}
      </p>
      <p className="mt-2 max-w-[60ch] text-ui text-ink-soft">
        Bekleyen öneriler düştü, açık emirler iptal edildi; elindeki pozisyonlar satılmadı. Yeniden başlatma iki kişi ister: Yönetici
        başlatır, Risk Sorumlusu onaylar.
      </p>
      <Link
        href={ROUTES.portfoy}
        className="group mt-4 inline-flex min-h-11 items-center gap-1.5 text-ui font-medium text-ink sm:min-h-0"
      >
        <span className="underline decoration-rule-ui underline-offset-4 group-hover:decoration-ink">Yeniden başlatma Portföy’de</span>
        <span aria-hidden className="transition-transform duration-[var(--dur-quick)] ease-[var(--ease-ink)] group-hover:translate-x-1">
          →
        </span>
      </Link>
    </section>
  );
}
