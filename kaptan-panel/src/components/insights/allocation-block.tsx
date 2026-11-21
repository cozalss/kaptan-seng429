"use client";

import "@/components/ufuk/ufuk.css";
import "@/components/portfolio/own-money.css";
import "./insights.css";

import { useState } from "react";
import type { Allocation } from "@/lib/domain/insights";
import { MAX_CONCENTRATION_PCT, MIN_CONCENTRATION_PCT } from "@/lib/domain/insights";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { pctText } from "@/lib/insights/words";
import { fmtLira } from "@/lib/solo/words";
import { Button } from "@/components/ui/button";

/** Holdings take a tone each; the tone follows the holding (by its place in the list), cash is hatched. */
const TONES = [100, 78, 60, 46, 34, 24] as const;
const tone = (i: number) => `color-mix(in srgb, var(--brand) ${TONES[i % TONES.length]}%, var(--paper))`;

/**
 * "Paran nerede?" in numbers: the share of the whole money (cash included) in every holding and every sector, a plain
 * sentence when one share is over the limit the person set, and the field to change that limit. Informational only:
 * nothing here suggests an order.
 */
export function AllocationBlock({ data, onChanged }: { data: Allocation | undefined; onChanged: () => void }) {
  const api = useApi();
  const [limit, setLimit] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  if (!data || !data.started || data.holdings.length === 0) return null;

  const typed = limit ?? String(data.threshold_pct);
  const top = data.holdings[0];
  const title = data.warning_tr ?? (top ? `Paranın en büyük parçası ${top.ticker}: %${pctText(top.pct)}.` : "");
  const save = async () => {
    const n = Number(typed);
    if (!Number.isInteger(n) || n < MIN_CONCENTRATION_PCT || n > MAX_CONCENTRATION_PCT) {
      setStatus({ text: `Sınır ${MIN_CONCENTRATION_PCT} ile ${MAX_CONCENTRATION_PCT} arasında bir tam sayı olsun.`, ok: false });
      return;
    }
    setPending(true);
    setStatus(null);
    try {
      await api.setConcentration(n);
      setLimit(null);
      setStatus({ text: `Sınırın %${n} oldu.`, ok: true });
      onChanged();
    } catch (err) {
      setStatus({ text: errorMessage(err), ok: false });
    } finally {
      setPending(false);
    }
  };

  return (
    <section aria-labelledby="dagilim" className="om">
      <div className="om-head">
        <h2 id="dagilim" className="u-chapter text-ink">
          {title}
        </h2>
        <p className="ins-lead">Burada paranın tamamı sayılır; nakit de bir parçadır. KAPtan bununla ilgili sana bir işlem önermez, yalnızca gösterir.</p>
      </div>

      <div className="ins-bar" role="img" aria-label={`Paranın dağılımı: ${data.holdings.map((h) => `${h.ticker} %${pctText(h.pct)}`).join(", ")}, nakit %${pctText(data.cash_pct)}`}>
        {data.holdings.map((h, i) => (
          <span key={h.ticker} style={{ width: `${h.pct}%`, background: tone(i) }} />
        ))}
        {data.cash_pct > 0 ? <span className="u-hatch" style={{ width: `${data.cash_pct}%` }} /> : null}
      </div>

      <ul className="ins-rows" aria-label="Hisse başına pay">
        {data.holdings.map((h, i) => (
          <li key={h.ticker} className="ins-row">
            <span className="ins-swatch" style={{ background: tone(i) }} aria-hidden />
            <span>
              {h.company} <span className="ins-sub">{h.ticker}</span>
            </span>
            <span className="ins-num">{fmtLira(h.value_try)}</span>
            <span className="ins-num">
              <strong>%{pctText(h.pct)}</strong>
            </span>
          </li>
        ))}
        <li className="ins-row">
          <span className="ins-swatch u-hatch" aria-hidden />
          <span>Nakit</span>
          <span className="ins-num">{fmtLira(data.cash_try)}</span>
          <span className="ins-num">
            <strong>%{pctText(data.cash_pct)}</strong>
          </span>
        </li>
      </ul>

      <h3 className="mt-8 text-ui font-semibold text-ink">Sektörlere göre</h3>
      <div className="mt-2 max-w-[58rem]" role="list" aria-label="Sektör başına pay">
        {data.sectors.map((s) => (
          <div key={s.sector} role="listitem" className="ins-sector">
            <div className="flex items-baseline justify-between gap-4 text-[1.0625rem] text-ink">
              <span>
                {s.sector} <span className="ins-sub">{s.tickers.join(", ")}</span>
              </span>
              <strong className="ins-num">%{pctText(s.pct)}</strong>
            </div>
            <div className="ins-sector-bar" aria-hidden>
              <span style={{ width: `${Math.min(100, s.pct)}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="ins-limit">
        <label className="ins-field">
          Tek hissede en çok kaç yüzde tutmak istersin?
          <input className="ins-input" inputMode="numeric" value={typed} onChange={(e) => setLimit(e.target.value)} aria-describedby="limit-help" />
        </label>
        <Button variant="secondary" size="lg" pending={pending} onClick={() => void save()}>
          Sınırı kaydet
        </Button>
      </div>
      <p id="limit-help" className="ins-sub mt-2">
        Bu yalnızca uyarı cümlesini değiştirir; hiçbir işlemi engellemez ya da başlatmaz.
      </p>
      <p role="status" className={status && !status.ok ? "ins-status ins-error" : "ins-status"}>
        {status?.text ?? ""}
      </p>
    </section>
  );
}
