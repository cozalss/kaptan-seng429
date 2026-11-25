import { fmtInt } from "@/lib/format";
import { sectionSentence } from "@/components/proposal/decide-logic";

export interface TodayInput {
  /** Anything held or any history yet; a new install has neither. */
  started: boolean;
  /** Open decisions (buy, sell and "tut" questions) still waiting. */
  decisions: number;
  /** How many of those are "tut" questions. */
  holds: number;
  /** Approved orders still to be entered at the bank. */
  steps: number;
  /** Important disclosures of the person's own companies still open today; null while unknown. */
  mine: number | null;
}

export interface TodayWords {
  /** The one sentence that answers "is anything happening with my stocks, must I decide?". */
  headline: string;
  /** One quieter sentence under it, or null. */
  detail: string | null;
}

function mineWords(mine: number | null, also: boolean): string | null {
  if (mine === null) return null;
  if (mine === 0) return "Hisselerinde önemli bir duyuru yok.";
  return `Hisselerinde ${fmtInt(mine)} önemli duyuru${also ? " da" : ""} var.`;
}

/** The home's header in words: decisions first, then the person's own companies. Pure. */
export function todayWords({ started, decisions, holds, steps, mine }: TodayInput): TodayWords {
  if (steps > 0 || decisions > 0) {
    const headline = steps > 0 ? sectionSentence({ decisions, steps }) : `Bugün ${fmtInt(decisions)} kararın var.`;
    const split = steps === 0 && holds > 0 && holds < decisions ? `${fmtInt(decisions - holds)} öneri, ${fmtInt(holds)} “tut” sorusu.` : null;
    const detail = [split, mineWords(mine, true)].filter(Boolean).join(" ");
    return { headline, detail: detail || null };
  }
  if (!started) return { headline: "Paran hazır, KAPtan okuyor.", detail: "Elinde hisse yok; paranın hepsi nakit. Söyleyecek bir şey olunca burada konuşur." };
  if (mine === null) return { headline: "Bugün karar vermen gereken bir şey yok.", detail: null };
  if (mine > 0) return { headline: `Senin hisselerinde bugün ${fmtInt(mine)} önemli duyuru var.`, detail: "Senden bekleyen bir karar yok." };
  return { headline: "Senin hisselerinde bugün önemli bir şey yok.", detail: "Senden bekleyen bir karar da yok." };
}
