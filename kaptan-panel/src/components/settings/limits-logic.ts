import { LIMIT_META, type LimitKey, type LimitValue, type LimitVersion } from "@/lib/domain";
import { fmtPct } from "@/lib/format";
import { locative, possessive } from "@/components/story/turkish";

/**
 * The limits as plain sentences ("Bir işlemde en fazla sermayenin %0,5’i riske girer.") and
 * the small conversions the change form needs. Pure.
 */
export const PLAIN_LIMITS: readonly LimitKey[] = [
  "risk_per_trade_pct",
  "max_position_pct",
  "max_concurrent_positions",
  "max_adv_share",
  "price_band_pct",
  "min_edge_cost_ratio",
  "daily_loss_halt_pct",
  "kill_drawdown_pct",
];

const pct = (v: number) => fmtPct(v, 2);

export function limitSentence(key: LimitKey, v: number): string {
  switch (key) {
    case "risk_per_trade_pct":
      return `Bir işlemde en fazla sermayenin ${possessive(pct(v))} riske girer.`;
    case "max_position_pct":
      return `Tek bir hisse sermayenin en fazla ${possessive(pct(v))} olabilir.`;
    case "max_concurrent_positions":
      return `Aynı anda en fazla ${v} pozisyon açık kalır.`;
    case "max_adv_share":
      return `Bir emir, hissenin günlük işlem hacminin en fazla ${possessive(pct(v))} olabilir.`;
    case "price_band_pct":
      return `Limit fiyat son fiyattan en fazla ±${pct(v)} uzaklaşır.`;
    case "min_edge_cost_ratio":
      return `Beklenen kazanç maliyetin en az ${String(v).replace(".", ",")} katı değilse öneri çıkmaz.`;
    case "daily_loss_halt_pct":
      return `Gün içinde ${pct(v)} zararda yeni emir durur.`;
    case "kill_drawdown_pct":
      return `Zirveden ${pct(v)} düşüşte her şey durur.`;
    default:
      return `${LIMIT_META[key].label_tr}: ${String(v).replace(".", ",")}`;
  }
}

export function valueOf(values: readonly LimitValue[], key: LimitKey): number | null {
  return values.find((v) => v.key === key)?.value ?? null;
}

/** What a form shows for a stored value: percents as "0,5", counts and ratios as they are. */
export function toInput(key: LimitKey, value: number): string {
  const unit = LIMIT_META[key].unit;
  const shown = unit === "pct" ? Math.abs(value * 100) : value;
  return String(Math.round(shown * 10_000) / 10_000).replace(".", ",");
}

/** Parse what was typed ("0,4", "0.4", "8") back to a stored value; null when it is not a number. */
export function fromInput(key: LimitKey, text: string): number | null {
  const n = Number(text.trim().replace(/\s/g, "").replace(",", "."));
  if (!text.trim() || !Number.isFinite(n) || n < 0) return null;
  const meta = LIMIT_META[key];
  if (meta.unit !== "pct") return n;
  const sign = key === "daily_loss_halt_pct" || key === "kill_drawdown_pct" ? -1 : 1;
  return Math.round(sign * (n / 100) * 1_000_000) / 1_000_000;
}

/** The unit hint next to the input. */
export function inputUnit(key: LimitKey): string {
  const unit = LIMIT_META[key].unit;
  if (unit === "pct") return key === "daily_loss_halt_pct" || key === "kill_drawdown_pct" ? "% (eksi)" : "%";
  if (unit === "count") return "adet";
  return "kat";
}

/** The one limit a version changed compared with another (proposals change one at a time). */
export function changedKey(next: LimitVersion, prev: LimitVersion): LimitKey | null {
  const hit = next.values.find((v) => valueOf(prev.values, v.key) !== v.value);
  return hit?.key ?? null;
}

/** "09.11" in Istanbul time (UTC+3 all year), the same everywhere Intl data differs. */
const IST_OFFSET_MS = 3 * 3_600_000;
const pad2 = (n: number) => String(n).padStart(2, "0");
function dm(iso: string): string {
  const d = new Date(Date.parse(iso) + IST_OFFSET_MS);
  return `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}`;
}

/**
 * One version's story in a line: "Üye 1 önerdi 08.11 · Üye 3 onayladı, 09.11’de yürürlüğe
 * girdi" (or "… · Üye 3 reddetti 09.11"; a version still waiting has only its first half).
 */
export function historyLine(v: LimitVersion): string {
  const proposed = `${v.proposed_by.name} önerdi ${dm(v.proposed_by.at)}`;
  const d = v.decided_by;
  if (!d) return proposed;
  if (v.status === "rejected") return `${proposed} · ${d.name} reddetti ${dm(d.at)}`;
  return `${proposed} · ${d.name} onayladı, ${locative(dm(v.effective_from ?? d.at))} yürürlüğe girdi`;
}
