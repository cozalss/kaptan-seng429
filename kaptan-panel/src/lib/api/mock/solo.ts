import type { ApprovalCard, EvidenceStrength, Position } from "@/lib/domain";
import { HoldInput, type Allocation, type Overview, type Suggestion } from "@/lib/solo/overview";
import { addDays, tradingDaysBetween } from "@/lib/time";
import { LIVE_STRATEGY, paperPnl } from "@/mocks/pnl";
import { round } from "@/mocks/rng";
import { ApiError, type KaptanApi } from "../types";
import { parse, userActor, type MockCtx } from "./guard";
import type { MockState } from "./state";
import * as sel from "./selectors";

/**
 * The home's one call (GET /me/overview) over the mock state the other screens read too: equity from the risk status, holdings from the positions, suggestions from the
 * pending approvals plus "keep holding" for the biggest positions that are not due to exit.
 * Deterministic for a given state and clock.
 */
export const CAPITAL_START = 1_000_000;
/** At most this many "TUT" cards (the biggest holdings that are not due to exit). */
const MAX_HOLDS = 2;

const CONFIDENCE: Readonly<Record<EvidenceStrength, number>> = { strong: 0.8, moderate: 0.6, weak: 0.4, insufficient: 0.25 };

/** One plain sentence per event: why buy (or sell) this, without jargon. */
function reasonFor(card: ApprovalCard): string {
  if (card.side === "sell") return "Planlanan tutma süresi doldu; kurallar satıp kârı ya da zararı kapatmayı söylüyor.";
  switch (card.event_type) {
    case "E1":
      return "Şirket kendi hissesini geri alıyor; geçmişte bu çoğu zaman fiyatı destekledi.";
    case "E2":
      return "Şirketin bir yöneticisi kendi parasıyla hisse aldı.";
    case "E3":
      return "Şirket yeni ve bağlayıcı bir iş sözleşmesi imzaladı.";
    case "E4":
      return "Şirket beklenenden iyi bir sonuç açıkladı.";
    default:
      return card.headline_tr;
  }
}

function fromApproval(card: ApprovalCard): Suggestion {
  return {
    id: card.proposal_id,
    symbol: card.ticker,
    action: card.side === "buy" ? "al" : "sat",
    reason_short: reasonFor(card),
    confidence: CONFIDENCE[card.evidence_summary.strength],
    expires_at: card.expires_at,
  };
}

const amountOf = (p: Position) => round(p.qty * p.last_price, 2);

function holdFor(p: Position, today: string): Suggestion {
  const left = Math.max(0, tradingDaysBetween(addDays(today, 1), p.planned_exit_date).length);
  return {
    id: `tut-${p.ticker}`,
    symbol: p.ticker,
    action: "tut",
    reason_short: left > 0 ? `Planlanan satışa ${left} işlem günü var; şimdilik elinde tut.` : "Plan değişmedi; şimdilik elinde tut.",
    confidence: 0.6,
    expires_at: null,
  };
}

export function overviewFor(state: MockState, realNow: number = Date.now()): Overview {
  const risk = sel.riskStatus(state, realNow);
  const today = risk.as_of.slice(0, 10);
  const held = sel.positions(state, realNow);
  const equity = risk.equity;

  const allocations: Allocation[] = held
    .map((p) => ({
      symbol: p.ticker,
      name: p.company_name,
      amount: amountOf(p),
      weight: equity > 0 ? round(amountOf(p) / equity, 4) : 0,
      pnl_pct: round(p.last_price / p.avg_cost - 1, 4),
    }))
    .sort((a, b) => b.amount - a.amount || a.symbol.localeCompare(b.symbol));
  const invested = allocations.reduce((s, a) => s + a.amount, 0);

  const pending = sel.approvalCards(state, realNow).filter((c) => c.status === "pending" && !c.run_id.startsWith("run-hist"));
  const sellingNow = new Set(pending.filter((c) => c.side === "sell").map((c) => c.ticker));
  const holds = [...held]
    .filter((p) => !sellingNow.has(p.ticker) && p.planned_exit_date > today)
    .sort((a, b) => amountOf(b) - amountOf(a))
    .slice(0, MAX_HOLDS)
    .map((p) => holdFor(p, today));

  const history = paperPnl()
    .filter((p) => p.strategy === LIVE_STRATEGY)
    .map((p) => ({ date: p.d, equity: p.equity }));
  const equity_series = [{ date: addDays(history[0]?.date ?? today, -1), equity: CAPITAL_START }, ...history.filter((p) => p.date < today), { date: today, equity }];

  return {
    capital_start: CAPITAL_START,
    equity_now: equity,
    cash: round(Math.max(0, equity - invested), 2),
    pnl_abs: round(equity - CAPITAL_START, 2),
    pnl_pct: round(equity / CAPITAL_START - 1, 5),
    equity_series,
    allocations,
    open_suggestions: [...pending.map(fromApproval), ...holds],
  };
}

export function createSolo(ctx: MockCtx): Pick<KaptanApi, "overview" | "holdSuggestion"> {
  return {
    async overview() {
      ctx.me();
      return ctx.ok(overviewFor(ctx.db.snapshot), 120);
    },

    async holdSuggestion(id, input) {
      const a = ctx.me();
      const d = parse(HoldInput, input);
      const s = ctx.db.snapshot;
      const known =
        overviewFor(s).open_suggestions.find((x) => x.id === id)?.symbol ?? sel.approvalCards(s).find((c) => c.proposal_id === id)?.ticker ?? null;
      if (!known) throw new ApiError(404, "not_found", "Öneri bulunamadı.");
      const at = ctx.now();
      // As the backend: audited, and the card itself is not decided (it stays until it expires).
      ctx.db.audit(userActor(a), `suggestion.${d.kind}`, "proposal", id, { ticker: known, note: Boolean(d.note?.trim()) });
      return ctx.ok({ id, kind: d.kind, at });
    },
  };
}
