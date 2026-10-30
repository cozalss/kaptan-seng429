import { fmtSignedPct } from "@/lib/format";
import type { Overview } from "@/lib/solo/overview";
import { fmtLira, fmtSignedLira, liraParts } from "@/lib/solo/words";
import { cn } from "@/lib/utils";
import { signTone } from "@/components/story/sign-tone";

/**
 * The three numbers the screen is about: what the money is worth now (large), how much it
 * gained or lost since the start (₺ and %), and the cash ready to use. One ink rule underneath
 * carries the three; on a wide screen the figures sit beside the big number.
 */
export function Headline({ overview }: { overview: Overview }) {
  const { whole, cents } = liraParts(overview.equity_now);
  const tone = signTone(Math.round(overview.pnl_abs));
  return (
    <section aria-labelledby="paran-baslik" className="animate-page-in border-b-2 border-ink pb-6 lg:flex lg:items-end lg:justify-between lg:gap-10">
      <div className="min-w-0">
        <h1 id="paran-baslik" className="label text-muted">
          Paran şu an
        </h1>
        <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5 text-ink" data-testid="toplam-para">
          <span className="solo-figure text-[48px] min-[400px]:text-[56px] sm:text-[88px]">{whole}</span>
          <span className="solo-figure text-[24px] text-muted sm:text-[40px]">,{cents}</span>
          <span className="solo-figure ml-1 text-[28px] text-ink-soft sm:text-[48px]">₺</span>
        </p>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:flex sm:gap-x-10 lg:mt-0 lg:shrink-0 lg:pb-2">
        <div className="min-w-0">
          <dt className="text-dense text-muted">Başladığından beri</dt>
          <dd className={cn("mt-0.5 text-[22px] leading-8 font-semibold whitespace-nowrap tabular-nums sm:text-[24px]", tone)}>{fmtSignedLira(overview.pnl_abs)}</dd>
          <dd className={cn("text-ui font-semibold tabular-nums", tone)}>{fmtSignedPct(overview.pnl_pct, 1)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-dense text-muted">Kullanılabilir nakit</dt>
          <dd className="mt-0.5 text-[22px] leading-8 font-semibold whitespace-nowrap text-ink tabular-nums sm:text-[24px]">{fmtLira(overview.cash)}</dd>
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <dt className="text-dense text-muted">Başlangıç parası</dt>
          <dd className="mt-0.5 text-[22px] leading-8 font-medium whitespace-nowrap text-ink-soft tabular-nums sm:text-[24px]">{fmtLira(overview.capital_start)}</dd>
        </div>
      </dl>
    </section>
  );
}
