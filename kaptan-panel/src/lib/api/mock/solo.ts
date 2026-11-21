import type { ApprovalCard, EvidenceStrength, Position } from "@/lib/domain";
import { HoldInput, type Allocation, type Overview, type Suggestion } from "@/lib/solo/overview";
import { addDays, tradingDaysBetween } from "@/lib/time";
import { istanbulDay } from "@/lib/session-day";
import { LIVE_STRATEGY, paperPnl } from "@/mocks/pnl";
import { round } from "@/mocks/rng";
import { ApiError, type KaptanApi } from "../types";
import { parse, userActor, type MockCtx } from "./guard";
import { SEED_START_TRY, SEED_STARTED_AT } from "./ledger";
import type { MockState } from "./state";
import * as sel from "./selectors";

/**
 * The home's one call (GET /me/overview) over the one book the other screens read too (ledger.ts):
 * money put in, cash, holdings at their last known price, suggestions from the pending approvals
 * plus "keep holding" for the biggest positions that are not due to exit. Before the starting
 * money exists everything is zero and empty (`needs_setup`). Deterministic for a given state and clock.
 */
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
  const book = sel.bookOf(state, realNow);
  if (!book.started) {
    return { needs_setup: true, capital_start: 0, equity_now: 0, cash: 0, pnl_abs: 0, pnl_pct: 0, prices_as_of: null, equity_series: [], allocations: [], open_suggestions: [] };
  }
  const today = new Date(sel.nowMs(state, realNow) + 3 * 3_600_000).toISOString().slice(0, 10);
  const held = book.positions;
  const equity = book.equity;

  const allocations: Allocation[] = held
    .map((p) => ({
      symbol: p.ticker,
      name: p.company_name,
      amount: amountOf(p),
      weight: equity > 0 ? round(amountOf(p) / equity, 4) : 0,
      pnl_pct: round(p.last_price / p.avg_cost - 1, 4),
      price_as_of: p.price_as_of,
    }))
    .sort((a, b) => b.amount - a.amount || a.symbol.localeCompare(b.symbol));

  const pending = sel.approvalCards(state, realNow).filter((c) => c.status === "pending" && !c.run_id.startsWith("run-hist"));
  const sellingNow = new Set(pending.filter((c) => c.side === "sell").map((c) => c.ticker));
  // KAPtan never suggested a share the person added by hand, so it has no word on keeping it either.
  const holds = [...held]
    .filter((p) => p.origin === "suggestion" && !sellingNow.has(p.ticker) && p.planned_exit_date > today)
    .sort((a, b) => amountOf(b) - amountOf(a))
    .slice(0, MAX_HOLDS)
    .map((p) => holdFor(p, today));

  // The daily closes since the start; today has not closed, so it is not in the series (the home adds "now" itself).
  const history = state.book.seeded
    ? paperPnl()
        .filter((p) => p.strategy === LIVE_STRATEGY && p.d < today)
        .map((p) => ({ date: p.d, equity: p.equity }))
    : [];
  // The line starts on the day the money was put in (the one start day Param names), not on the eve of the first close.
  const startDay = istanbulDay(Date.parse(SEED_STARTED_AT));
  const equity_series = history.length ? [{ date: startDay < (history[0]?.date ?? today) ? startDay : addDays(history[0]?.date ?? today, -1), equity: SEED_START_TRY }, ...history] : [];

  return {
    needs_setup: false,
    capital_start: book.put_in,
    equity_now: equity,
    cash: book.cash,
    pnl_abs: round(equity - book.put_in, 2),
    pnl_pct: book.put_in > 0 ? round(equity / book.put_in - 1, 5) : 0,
    prices_as_of: book.prices_as_of,
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
