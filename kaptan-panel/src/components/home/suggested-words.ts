import type { ApprovalCard, ApprovalStatus } from "@/lib/domain/trading";
import type { QuietDay, TrackDecision, TrackItem } from "@/lib/domain/reports";
import { fmtInt, fmtPct } from "@/lib/format";

/**
 * "Öneriye düşenler": every disclosure that became a suggestion, newest first, with what KAPtan said, what
 * the person did and how it went since. Built from the approvals and the track record the panel already
 * reads (joined on the proposal id). Pure.
 */

/** On the home, this many rows; the rest are on /oneriler. */
export const HOME_SUGGESTED_MAX = 5;

/** The filters on /oneriler, in order. Their keys are also the `?durum=` values. */
export const SUGGESTED_FILTERS = [
  { key: "hepsi", label: "Hepsi" },
  { key: "bekliyor", label: "Bekliyor" },
  { key: "onayladin", label: "Onayladın" },
  { key: "gectin", label: "Geçtin" },
  { key: "doldu", label: "Süresi doldu" },
] as const;
export type SuggestedFilter = (typeof SUGGESTED_FILTERS)[number]["key"];
export type SuggestedState = Exclude<SuggestedFilter, "hepsi"> | "iptal";

const STATE_OF: Readonly<Record<ApprovalStatus, SuggestedState>> = {
  pending: "bekliyor",
  claimed: "bekliyor",
  approved: "onayladin",
  rejected: "gectin",
  expired: "doldu",
  cancelled: "iptal",
};

/** Bought: the result is what happened. Otherwise it is what following it would have given. */
export function isIfFollowed(d: TrackDecision): boolean {
  return d !== "took" && d !== "approved_open";
}

/** The status, as the row says it. */
export const STATE_WORD: Readonly<Record<SuggestedState, string>> = {
  bekliyor: "Bekliyor",
  onayladin: "Onayladın",
  gectin: "Geçtin",
  doldu: "Süresi doldu",
  iptal: "İptal oldu",
};

export interface SuggestedRow {
  id: string;
  at: string;
  ticker: string;
  company: string;
  /** The disclosure, in one plain line. */
  line: string;
  verb: "al" | "sat";
  /** Why KAPtan suggested it, in one line. */
  why: string;
  state: SuggestedState;
  /** The result since the suggestion (0.032 = +%3,2); null while open or without prices. */
  ratio: number | null;
  /** The result is what following it would have given (not bought). */
  ifFollowed: boolean;
  /** Why there is no result yet, when there is none. */
  pending: string | null;
}

/** Why KAPtan suggested it, from the past cases on the card; the kind of news when there are none. */
export function whyLine(card: Pick<ApprovalCard, "side" | "sub_type_tr" | "evidence_summary">): string {
  const e = card.evidence_summary;
  if (card.side === "sell" || e.n === 0) return card.sub_type_tr;
  const m = e.median_car_5d;
  const how = m === 0 ? "piyasayla aynı gitti" : `piyasadan ${fmtPct(Math.abs(m), 1)} ${m > 0 ? "iyi" : "kötü"} gitti`;
  return `Benzer ${fmtInt(e.n)} olayda ortadaki hisse 5 günde ${how}.`;
}

function pendingWord(state: SuggestedState, track: TrackItem | undefined): string | null {
  if (track?.return_ratio != null) return null;
  if (state === "bekliyor") return "Kararını bekliyor";
  if (state === "iptal") return null;
  if (!track || track.status === "open") return "Sonuç henüz belli değil";
  return "Fiyat yok";
}

/** One row per suggestion, newest first. */
export function suggestedRows(cards: readonly ApprovalCard[], track: readonly TrackItem[]): SuggestedRow[] {
  const byId = new Map(track.map((t) => [t.proposal_id, t]));
  return [...cards]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((c) => {
      const t = byId.get(c.proposal_id);
      const state = STATE_OF[c.status];
      return {
        id: c.proposal_id,
        at: c.created_at,
        ticker: c.ticker,
        company: c.company_name,
        line: c.headline_tr,
        verb: c.side === "sell" ? "sat" : "al",
        why: whyLine(c),
        state,
        ratio: t?.return_ratio ?? null,
        ifFollowed: t ? isIfFollowed(t.decision) : state !== "onayladin",
        pending: pendingWord(state, t),
      };
    });
}

export function filterRows(rows: readonly SuggestedRow[], filter: SuggestedFilter): SuggestedRow[] {
  return filter === "hepsi" ? [...rows] : rows.filter((r) => r.state === filter);
}

export function isSuggestedFilter(v: string | null | undefined): v is SuggestedFilter {
  return SUGGESTED_FILTERS.some((f) => f.key === v);
}

/** The biggest known move among the rows, so their bars share one scale. 0 when none is known. */
export function ratioScale(rows: readonly SuggestedRow[]): number {
  return rows.reduce((m, r) => (r.ratio === null ? m : Math.max(m, Math.abs(r.ratio))), 0);
}

/** The empty state: why nothing has reached a suggestion yet, from today's reading. */
export function emptyReason(q: Pick<QuietDay, "read" | "relevant" | "reasons"> | null): string {
  const head = "Henüz hiçbir duyuru öneriye dönüşmedi.";
  if (!q) return `${head} KAPtan yalnız işlem hacmi yüksek hisselere ve izlediklerine öneri verir.`;
  if (q.read === 0) return `${head} KAP'tan bugün henüz duyuru gelmedi.`;
  const looked =
    q.relevant === 0
      ? `Bugün ${fmtInt(q.read)} duyuru okundu; hiçbiri KAPtan'ın öneri verebileceği türden bir olay değildi.`
      : `Bugün ${fmtInt(q.read)} duyuru okundu, ${fmtInt(q.relevant)} tanesine yakından bakıldı.`;
  const top = q.relevant > 0 ? q.reasons[0] : undefined;
  return `${head} ${looked}${top ? ` En sık neden: ${top.reason_tr}.` : ""}`;
}
