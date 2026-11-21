"use client";

import "@/components/ufuk/ufuk.css";
import "@/components/portfolio/own-money.css";
import "./insights.css";

import type { DividendIncome } from "@/lib/domain/insights";
import { fmtLira } from "@/lib/solo/words";

const MONTH_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"] as const;
const monthName = (m: string) => MONTH_SHORT[Number(m.slice(5, 7)) - 1] ?? m;

/**
 * Dividend income as it was recorded: twelve monthly bars (height = money), this year against last year, and what each
 * share paid over what it cost you. No forecast: only money that reached your bank and that you wrote down.
 */
export function DividendsBlock({ data }: { data: DividendIncome | undefined }) {
  if (!data || data.total_try <= 0) return null;
  const top = Math.max(...data.months.map((m) => m.total_try), 1);
  const withYield = data.holdings.filter((h) => h.yield_on_cost_pct !== null);

  return (
    <section aria-labelledby="kar-payi-geliri" className="om">
      <div className="om-head">
        <h2 id="kar-payi-geliri" className="u-chapter text-ink">
          Bu yıl {fmtLira(data.this_year_try, true)} kâr payı aldın.
        </h2>
        <p className="ins-lead">
          Geçen yıl {fmtLira(data.last_year_try, true)}, başladığından beri toplam {fmtLira(data.total_try, true)}. Yalnızca bankana geçtiğini yazdığın kâr paylarını sayıyorum; gelecek için tahmin yazmam.
        </p>
      </div>

      <ol className="ins-months" aria-label="Son 12 ay, aylık kâr payı">
        {data.months.map((m) => (
          <li key={m.month} className="ins-month" title={`${monthName(m.month)} ${m.month.slice(0, 4)}: ${fmtLira(m.total_try, true)}`}>
            <span style={{ height: `${(m.total_try / top) * 100}%`, ...(m.total_try === 0 ? { background: "transparent" } : {}) }} />
            <span className="sr-only">{`${monthName(m.month)} ${m.month.slice(0, 4)}: ${fmtLira(m.total_try, true)}`}</span>
          </li>
        ))}
      </ol>
      <ol className="ins-month-names" aria-hidden>
        {data.months.map((m) => (
          <li key={m.month}>{monthName(m.month)}</li>
        ))}
      </ol>

      {withYield.length > 0 ? (
        <>
          <h3 className="mt-8 text-ui font-semibold text-ink">Maliyetine göre getirisi (son 12 ay)</h3>
          <ul className="ins-rows" aria-label="Maliyete göre kâr payı getirisi">
            {withYield.map((h) => (
              <li key={h.ticker} className="ins-row" style={{ gridTemplateColumns: "minmax(0, 1fr) auto auto" }}>
                <span>
                  {h.company} <span className="ins-sub">{h.ticker}</span>
                </span>
                <span className="ins-num">{fmtLira(h.last12_try, true)}</span>
                <span className="ins-num">
                  <strong>%{String(h.yield_on_cost_pct).replace(".", ",")}</strong>
                </span>
              </li>
            ))}
          </ul>
          <p className="ins-sub mt-2">Getiri, son 12 ayda aldığın kâr payının, elindeki payların sana maliyetine oranıdır.</p>
        </>
      ) : null}
    </section>
  );
}
