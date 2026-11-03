import type { LimitsView, RiskStatus } from "@/lib/domain";
import { fmtLira } from "@/lib/solo/words";
import { cn } from "@/lib/utils";
import { Boat } from "@/components/ufuk/boat";
import { valueOf } from "@/components/settings/limits-logic";
import { dayGuard, peakGuard, type Guard } from "./param-words";

/**
 * What protects the money, phrased as protection and only from real figures. Neither brake is a
 * promise about the holdings: they keep moving with the market. So the sentence says what KAPtan
 * does at that point, not how much you "can lose".
 */
export function Guards({ risk, limits }: { risk: RiskStatus | null; limits: LimitsView | null }) {
  const halt = limits ? valueOf(limits.active.values, "daily_loss_halt_pct") : null;
  const stop = limits ? valueOf(limits.active.values, "kill_drawdown_pct") : null;
  if (!risk) return null;
  const day = halt !== null ? dayGuard(risk, halt) : null;
  const peak = stop !== null ? peakGuard(risk, stop) : null;
  return (
    <div className="pm-guards">
      <h2 className="u-chapter text-ink">Seni koruyan iki fren</h2>
      {day ? (
        <GuardRow
          guard={day}
          label="Günlük fren"
          fromLabel="bugünün başı"
          say={
            day.reached
              ? "Bugünlük frene geldin: yeni işlem yok. Yarın kendiliğinden kalkar."
              : `Paran bugün ${fmtLira(day.limit)} düşerse KAPtan o gün yeni işlem önermez. Şu an bu sınıra ${fmtLira(day.distance)} uzaktasın.`
          }
        />
      ) : null}
      {peak ? (
        <GuardRow
          guard={peak}
          label="Büyük fren"
          fromLabel="en yüksek hâli"
          say={
            peak.reached
              ? "Büyük frene geldin: her şey durur. Elindeki hisseler satılmaz."
              : `Paran en yüksek hâlinden ${fmtLira(peak.limit)} düşerse her şey durur; elindekiler satılmaz. Şu an ${fmtLira(peak.distance)} uzaktasın.`
          }
        />
      ) : null}
      <RegimeLine regime={risk.regime} />
    </div>
  );
}

/** The money as a boat between the brake (red, left) and where the measure began (right). */
function GuardRow({ guard, label, say, fromLabel }: { guard: Guard; label: string; say: string; fromLabel: string }) {
  const span = Math.max(guard.start, guard.floor + guard.distance) - guard.floor;
  const at = span > 0 ? Math.max(0, Math.min(1, guard.distance / span)) : 0;
  return (
    <div className="pm-guard">
      <h3 className="text-body font-semibold text-ink">{label}</h3>
      <p className={cn("mt-1 max-w-[62ch] text-body text-ink-soft", guard.reached && "font-semibold text-ink")}>{say}</p>
      <div aria-hidden className="pm-gauge">
        <span className="pm-gauge-track" style={{ "--pm-at": at } as React.CSSProperties}>
          <span className="pm-gauge-fill u-hatch" />
          <span className="pm-gauge-stop" />
          <Boat className="pm-gauge-boat" />
        </span>
        <span className="pm-gauge-labels">
          <span>fren: {fmtLira(guard.floor)}</span>
          <span>
            {fromLabel}: {fmtLira(guard.start)}
          </span>
        </span>
      </div>
    </div>
  );
}

/** The market's mood today (06 §9, live over SSE desk `regime`), and what it changes for you. */
export function RegimeLine({ regime }: { regime: RiskStatus["regime"] }) {
  const crisis = regime === "crisis";
  return (
    <p data-regime={regime} aria-live="polite" className={cn("pm-regime", crisis && "pm-regime-storm")}>
      <span aria-hidden className="pm-regime-dot" />
      {crisis ? "Piyasa bugün fırtınalı. KAPtan yeni alımları yarı tutarla önerir, günde en fazla 1 tane." : "Piyasa bugün sakin. Sınırlar olağan."}
    </p>
  );
}
