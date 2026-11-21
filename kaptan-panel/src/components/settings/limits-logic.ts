import { LIMIT_META, type LimitKey, type LimitValue, type LimitVersion, type RiskStatus } from "@/lib/domain";
import { fmtPct } from "@/lib/format";
import { fmtLira } from "@/lib/solo/words";
import { locative, possessive } from "@/components/story/turkish";

/**
 * The limits as plain sentences ("Bir işlemde en fazla paranın %0,5’i riske girer.") and
 * the small conversions the change form needs. Pure.
 */
export const PLAIN_LIMITS: readonly LimitKey[] = [
  "risk_per_trade_pct",
  "max_position_pct",
  "max_concurrent_positions",
  "max_adv_share",
  "price_band_pct",
  "min_edge_cost_ratio",
];

/** The ones a person meets; the rest are technical and fold away. */
export const FIRST_LIMITS: readonly LimitKey[] = ["risk_per_trade_pct", "max_position_pct", "max_concurrent_positions"];

/** A limit's short name. */
const LIMIT_TITLE: Readonly<Partial<Record<LimitKey, string>>> = {
  risk_per_trade_pct: "Bir işlemin riski",
  max_position_pct: "Tek hisseye giden",
  max_concurrent_positions: "Aynı anda hisse",
  max_adv_share: "İşlemin büyüklüğü",
  price_band_pct: "Fiyat aralığı",
  min_edge_cost_ratio: "Kazanç ve maliyet",
};

export function limitTitle(key: LimitKey): string {
  return LIMIT_TITLE[key] ?? LIMIT_META[key].label_tr;
}

/** The screen's sentence, once the limits are known. */
export function settingsSentence(count: number | null): string {
  if (count === null) return "Sınırlarına bakıyorum…";
  if (count === 0) return "Henüz bir sınırın yok.";
  return `Paranı ${count} sınır koruyor.`;
}

const pct = (v: number) => fmtPct(v, 2);

/** What a limit comes to today, in lira, from the real money. Null where it has no lira meaning. */
export function limitForYou(key: LimitKey, v: number, risk: Pick<RiskStatus, "equity"> | null): string | null {
  if (!risk) return null;
  switch (key) {
    case "risk_per_trade_pct":
      return `Bugünkü paranla: bir işlemde ${fmtLira(risk.equity * v)} kadar.`;
    case "max_position_pct":
      return `Bugünkü paranla: tek hisseye en fazla ${fmtLira(risk.equity * v)}.`;
    default:
      return null;
  }
}

export function limitSentence(key: LimitKey, v: number): string {
  switch (key) {
    case "risk_per_trade_pct":
      return `Bir işlemde en fazla paranın ${possessive(pct(v))} riske girer.`;
    case "max_position_pct":
      return `Tek bir hisse paranın en fazla ${possessive(pct(v))} olabilir.`;
    case "max_concurrent_positions":
      return `Aynı anda en fazla ${v} farklı hisse elinde olur.`;
    case "max_adv_share":
      return `Bir işlem, hissenin günlük alım satımının en fazla ${possessive(pct(v))} olabilir.`;
    case "price_band_pct":
      return `Önerilen fiyat, son fiyattan en fazla ±${pct(v)} uzaklaşır.`;
    case "min_edge_cost_ratio":
      return `Beklenen kazanç maliyetin en az ${String(v).replace(".", ",")} katı değilse öneri çıkmaz.`;
    default:
      return `${LIMIT_META[key].label_tr}: ${String(v).replace(".", ",")}`;
  }
}

/** The value alone, as a settings row shows it on the right: "%0,5", "10", "±%5", "2×". */
export function limitValueText(key: LimitKey, v: number): string {
  switch (key) {
    case "max_concurrent_positions":
      return String(v);
    case "price_band_pct":
      return `±${pct(v)}`;
    case "min_edge_cost_ratio":
      return `${String(v).replace(".", ",")}×`;
    case "risk_per_trade_pct":
    case "max_position_pct":
    case "max_adv_share":
      return pct(v);
    default:
      return String(v).replace(".", ",");
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
  return Math.round((n / 100) * 1_000_000) / 1_000_000;
}

/** The unit hint next to the input. */
export function inputUnit(key: LimitKey): string {
  const unit = LIMIT_META[key].unit;
  if (unit === "pct") return "%";
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

/** One version's story in a line: "09.11’de yürürlüğe girdi", "09.11’de vazgeçtin" or "08.11’de önerildi". */
export function historyLine(v: LimitVersion): string {
  const d = v.decided_by;
  if (!d) return `${locative(dm(v.proposed_by.at))} önerildi`;
  if (v.status === "rejected") return `${locative(dm(d.at))} vazgeçtin`;
  return `${locative(dm(v.effective_from ?? d.at))} yürürlüğe girdi`;
}
