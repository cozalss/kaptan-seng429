import type { RiskStatus } from "@/lib/domain";
import { cn } from "@/lib/utils";

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
