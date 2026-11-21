import type { PriceStats } from "@/lib/company/company";
import { fmtDate, fmtFigurePct, fmtInt } from "@/lib/format";
import { fmtLira } from "@/lib/solo/words";

/** A year of trading days is about 250; fewer than this and the "yıllık" range is really shorter. */
const FULL_YEAR_DAYS = 240;

const lira = (n: number | null) => (n === null ? "Kayıtlı değil" : fmtLira(n, true));

/** One quiet sentence per number that needs a caveat; empty when the numbers say what they say. */
export function statsNotes(s: PriceStats): string[] {
  const notes: string[] = [];
  if (s.year_days < FULL_YEAR_DAYS) notes.push(`Elimde yalnızca ${fmtInt(s.year_days)} borsa gününün fiyatı var; aşağıdaki “yıllık” aralık bundan kısa bir süreyi gösteriyor.`);
  if (s.adjusted) notes.push("Yıllık aralık, sermaye artırımlarına (bedelsiz gibi) göre düzeltildi; sahte bir düşüş görünmez.");
  return notes;
}

/** The last day's range and volume, the year's lowest and highest price and how far the last close is from the top. */
export function StatsStrip({ stats }: { stats: PriceStats }) {
  const notes = statsNotes(stats);
  return (
    <div className="co-stats">
      <dl className="co-stats-grid">
        <div>
          <dt>Son gün, en düşük – en yüksek</dt>
          <dd className="tabular-nums">{stats.day_low !== null && stats.day_high !== null ? `${lira(stats.day_low)} – ${lira(stats.day_high)}` : "Kayıtlı değil"}</dd>
        </div>
        <div>
          <dt>Son günün hacmi</dt>
          <dd className="tabular-nums">{stats.volume === null ? "Kayıtlı değil" : `${fmtInt(Math.round(stats.volume))} adet`}</dd>
        </div>
        <div>
          <dt>Yılın en düşüğü</dt>
          <dd className="tabular-nums">
            {lira(stats.year_low)}
            {stats.year_low_day ? <small> · {fmtDate(stats.year_low_day)}</small> : null}
          </dd>
        </div>
        <div>
          <dt>Yılın en yükseği</dt>
          <dd className="tabular-nums">
            {lira(stats.year_high)}
            {stats.year_high_day ? <small> · {fmtDate(stats.year_high_day)}</small> : null}
          </dd>
        </div>
        <div>
          <dt>Yılın en yükseğine uzaklık</dt>
          <dd className="tabular-nums">{stats.from_high_pct === null ? "Hesaplanamadı" : fmtFigurePct(stats.from_high_pct / 100)}</dd>
        </div>
      </dl>
      {notes.map((n) => (
        <p key={n} className="co-stats-note">
          {n}
        </p>
      ))}
    </div>
  );
}
