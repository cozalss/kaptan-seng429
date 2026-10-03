import { LIMIT_META, LimitKey, type LimitValue, type LimitVersion } from "@/lib/domain";
import { fmtInt } from "@/lib/format";

/**
 * Pure helpers for /limits (FRONTEND-SPEC §2.8, US-40, 09 §5 (a)): unit-aware formatting
 * and parsing, version diffs and the four-eyes rule (proposer ≠ approver).
 */

/** What each limit does, in one plain line (06 §9–10). */
export const LIMIT_DESCRIPTION: Readonly<Record<LimitKey, string>> = {
  risk_per_trade_pct: "Stop mesafesine göre bir işlemde göze alınan özsermaye payı.",
  max_position_pct: "Tek pozisyonun özsermayeye oranı üst sınırı.",
  max_concurrent_positions: "Aynı anda açık en çok pozisyon sayısı.",
  target_concurrent_positions: "Boyutlandırmanın hedeflediği pozisyon sayısı.",
  max_adv_share: "Emrin 20 günlük ortalama işlem hacmine oranı.",
  price_band_pct: "Limit fiyatın referans fiyattan en çok sapması.",
  daily_loss_halt_pct: "Bu günlük K/Z'de yeni emir durur; ertesi seans kalkar.",
  kill_drawdown_pct: "Zirveden bu düşüşte kill switch açılır.",
  min_edge_cost_ratio: "Beklenen avantaj, gidiş-dönüş maliyetin en az bu katı.",
  crisis_exposure_mult: "Kriz rejiminde maruziyet bu çarpanla küçülür.",
  leak_ret5d_threshold: "Bildirim öncesi 5 seans getirisi bunu aşarsa sızıntı sayılır.",
  max_sector_pct: "Tek sektörün portföydeki üst payı.",
  max_group_pct: "Tek holding grubunun portföydeki üst payı.",
};

export const LIMIT_KEYS: readonly LimitKey[] = LimitKey.options;

function trNumber(n: number, maxDigits = 3): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: maxDigits }).format(n);
}

/** Display value: "%0,5", "−%1", "10", "2×", "×0,5". */
export function formatLimit(key: LimitKey, value: number): string {
  const unit = LIMIT_META[key].unit;
  if (unit === "pct") {
    const body = trNumber(Math.abs(value * 100), 2);
    return `${value < 0 ? "−" : ""}%${body}`;
  }
  if (unit === "count") return fmtInt(value);
  if (unit === "ratio") return `${trNumber(value, 2)}×`;
  return `×${trNumber(value, 2)}`;
}

/** Unit suffix shown next to an input. */
export function unitLabel(key: LimitKey): string {
  const unit = LIMIT_META[key].unit;
  if (unit === "pct") return "%";
  if (unit === "count") return "adet";
  if (unit === "ratio") return "kat";
  return "çarpan";
}

/** Value as the user edits it: percentages in points ("0,5"), others as is. */
export function toInputText(key: LimitKey, value: number): string {
  const v = LIMIT_META[key].unit === "pct" ? value * 100 : value;
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 4, useGrouping: false }).format(v);
}

export type ParseResult = { ok: true; value: number } | { ok: false; error: string };

/** Parse a Turkish-formatted input back into the stored value, with sanity bounds. */
export function parseLimitInput(key: LimitKey, text: string, current: number): ParseResult {
  const raw = text.trim().replace(/\s/g, "").replace("−", "-").replace(",", ".");
  if (!raw) return { ok: false, error: "Değer gerekli." };
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return { ok: false, error: "Sayı girin (ondalık için virgül)." };
  const n = Number(raw);
  const unit = LIMIT_META[key].unit;
  if (unit === "count") {
    if (!Number.isInteger(n) || n < 1 || n > 50) return { ok: false, error: "1 ile 50 arasında tam sayı." };
    return { ok: true, value: n };
  }
  if (unit === "pct") {
    const v = Math.round((n / 100) * 1e6) / 1e6;
    if (v === 0) return { ok: false, error: "Sıfır olamaz." };
    if (Math.sign(v) !== Math.sign(current)) return { ok: false, error: current < 0 ? "Zarar eşiği negatif olmalı." : "Pozitif olmalı." };
    if (Math.abs(v) > 1) return { ok: false, error: "En çok %100." };
    return { ok: true, value: v };
  }
  if (unit === "ratio") {
    if (n < 1 || n > 10) return { ok: false, error: "1× ile 10× arasında." };
    return { ok: true, value: n };
  }
  if (n <= 0 || n > 1) return { ok: false, error: "0'dan büyük, en çok 1." };
  return { ok: true, value: n };
}

export interface DiffRow {
  key: LimitKey;
  before: number | null;
  after: number | null;
  changed: boolean;
  /** "looser" = more risk allowed, "tighter" = less; null when unchanged or not comparable. */
  effect: "looser" | "tighter" | null;
}

/**
 * Whether a bigger number allows more risk. Loss thresholds are negative, so "more
 * negative" (bigger |x|) is looser there too; ratio and count floors invert.
 */
function looserWhenBigger(key: LimitKey): boolean {
  return key !== "min_edge_cost_ratio";
}

export function effectOf(key: LimitKey, before: number, after: number): DiffRow["effect"] {
  if (before === after) return null;
  const grows = Math.abs(after) > Math.abs(before);
  return grows === looserWhenBigger(key) ? "looser" : "tighter";
}

export function diffLimits(from: readonly LimitValue[], to: readonly LimitValue[]): DiffRow[] {
  const a = new Map(from.map((v) => [v.key, v.value]));
  const b = new Map(to.map((v) => [v.key, v.value]));
  return LIMIT_KEYS.filter((k) => a.has(k) || b.has(k)).map((key) => {
    const before = a.get(key) ?? null;
    const after = b.get(key) ?? null;
    const changed = before !== after;
    return { key, before, after, changed, effect: before !== null && after !== null ? effectOf(key, before, after) : null };
  });
}

export function changedCount(rows: readonly DiffRow[]): number {
  return rows.filter((r) => r.changed).length;
}

/** The version a proposal is compared with: the one active when it was created. */
export function baselineFor(v: LimitVersion, history: readonly LimitVersion[]): LimitVersion | undefined {
  const earlier = history.filter((h) => h.version < v.version && (h.status === "active" || h.status === "superseded"));
  return earlier.sort((x, y) => y.version - x.version)[0];
}

export interface FourEyes {
  canDecide: boolean;
  reason: string | null;
}

/** 09 §5 (a): the proposer may not approve their own proposal. */
export function fourEyes(v: Pick<LimitVersion, "status" | "created_by">, me: { uid: string; canApprove: boolean; deniedReason: string }): FourEyes {
  if (v.status !== "proposed") return { canDecide: false, reason: "Bu öneri artık onay beklemiyor." };
  if (!me.canApprove) return { canDecide: false, reason: me.deniedReason };
  if (v.created_by === me.uid) return { canDecide: false, reason: "Öneren onaylayamaz (dört göz)." };
  return { canDecide: true, reason: null };
}

export const STATUS_LABEL: Readonly<Record<LimitVersion["status"], string>> = {
  proposed: "Onay bekliyor",
  active: "Geçerli",
  superseded: "Eski",
  rejected: "Reddedildi",
};

export interface DraftField {
  text: string;
  error: string | null;
}

/** Validate an edit grid; returns the changes or the first field errors. */
export function collectChanges(
  active: readonly LimitValue[],
  draft: Readonly<Partial<Record<LimitKey, string>>>,
): { changes: LimitValue[]; errors: Partial<Record<LimitKey, string>> } {
  const changes: LimitValue[] = [];
  const errors: Partial<Record<LimitKey, string>> = {};
  for (const v of active) {
    const text = draft[v.key];
    if (text === undefined || text === toInputText(v.key, v.value)) continue;
    const r = parseLimitInput(v.key, text, v.value);
    if (!r.ok) errors[v.key] = r.error;
    else if (r.value !== v.value) changes.push({ key: v.key, value: r.value });
  }
  return { changes, errors };
}
