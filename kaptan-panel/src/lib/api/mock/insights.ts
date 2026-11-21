import type { Allocation, ClosedTrade, ClosedTrades, DividendIncome, ReturnStats, Versus, VersusItem } from "@/lib/domain/insights";
import { ConcentrationInput, DEFAULT_CONCENTRATION_PCT, HoldingNoteInput } from "@/lib/domain/insights";
import { MSG_FEW_SALES, MSG_HAND_DAYS, MSG_NEED_TWO_CLOSES, MSG_NO_DOLLAR, MSG_NO_NOTE, MSG_NO_OFFICIAL, MSG_NOT_IN_BOOK, UNKNOWN_SECTOR, concentrationWarning } from "@/lib/insights/words";
import { findIssuer } from "@/mocks/issuers";
import { ApiError, type KaptanApi } from "../types";
import { liveRows } from "./corporate-ledger";
import { parse, userActor, type MockCtx } from "./guard";
import * as sel from "./selectors";

/**
 * The Param insights in the test double: the same shapes, words and honesty as the backend (`backend/src/kaptan/insights`).
 * Closed trades are the sales of hand-entered holdings plus two fictional finished trades of the seeded book (like the
 * issuers, fiction); dollar, inflation and deposit are missing here exactly as on a PC with no stored rates.
 */
type Insights = Pick<KaptanApi, "insightsAllocation" | "setConcentration" | "closedTrades" | "returnStats" | "dividendIncome" | "versusMoney" | "holdingNotes" | "saveHoldingNote" | "clearHoldingNote">;

const LIVE_STRATEGY = "kaptan:v1.1-fwd";
const ENOUGH_DAYS = 20;
const FEW_SALES = 5;
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Two finished trades of the seeded book: shares bought and sold through KAPtan's own tickets before the demo day. */
const SEED_TRADES: readonly ClosedTrade[] = [
  { id: "satis-seed-1", ticker: "TMSLJ", company: "TOROS LOJİSTİK A.Ş.", sold_at: "2027-01-07T11:20:00.000Z", qty: 800, cost_try: 7_760, proceeds_try: 8_432, gain_try: 672, gain_pct: 8.66, days_held: 6 },
  { id: "satis-seed-2", ticker: "DMOKM", company: "DOĞU KİMYA A.Ş.", sold_at: "2027-01-05T12:05:00.000Z", qty: 200, cost_try: 10_480, proceeds_try: 9_924, gain_try: -556, gain_pct: -5.31, days_held: 9 },
];

export function createInsights(ctx: MockCtx): Insights {
  const { db, ok, now } = ctx;
  const insights = () => db.snapshot.book.insights ?? { threshold_pct: DEFAULT_CONCENTRATION_PCT, notes: [] };
  const setInsights = (next: NonNullable<typeof db.snapshot.book.insights>) => db.update((s) => ({ ...s, book: { ...s.book, insights: next } }));

  const allocation = (): Allocation => {
    const book = sel.bookOf(db.snapshot);
    const equity = book.equity;
    const pct = (v: number) => (equity > 0 ? r1((v / equity) * 100) : 0);
    const holdings = book.positions
      .map((p) => ({ ticker: p.ticker, company: p.company_name, sector: findIssuer(p.ticker)?.sector ?? null, value_try: r2(p.qty * p.last_price), pct: 0 }))
      .map((h) => ({ ...h, pct: pct(h.value_try) }))
      .sort((a, b) => b.value_try - a.value_try);
    const bySector = new Map<string, { sector: string; value_try: number; pct: number; tickers: string[] }>();
    for (const h of holdings) {
      const key = h.sector ?? UNKNOWN_SECTOR;
      const row = bySector.get(key) ?? { sector: key, value_try: 0, pct: 0, tickers: [] };
      bySector.set(key, { ...row, value_try: r2(row.value_try + h.value_try), pct: r1(row.pct + h.pct), tickers: [...row.tickers, h.ticker] });
    }
    const limit = insights().threshold_pct;
    const top = holdings[0];
    return {
      started: book.started,
      equity_try: equity,
      cash_try: book.cash,
      cash_pct: pct(book.cash),
      holdings,
      sectors: [...bySector.values()].sort((a, b) => b.value_try - a.value_try),
      threshold_pct: limit,
      warning_tr: concentrationWarning(top ? { ticker: top.ticker, pct: top.pct } : null, limit),
    };
  };

  const handTrades = (): ClosedTrade[] =>
    db.snapshot.book.holdings.flatMap((h) =>
      h.sales.map((s, i): ClosedTrade => {
        const cost = r2(s.qty * h.avg_cost);
        const proceeds = r2(s.qty * s.price - s.commission);
        return { id: `satis-${h.id}-${i + 1}`, ticker: h.ticker, company: h.company_name, sold_at: s.at, qty: s.qty, cost_try: cost, proceeds_try: proceeds, gain_try: r2(proceeds - cost), gain_pct: cost > 0 ? r2(((proceeds - cost) / cost) * 100) : null, days_held: null };
      }),
    );

  const closed = (): ClosedTrades => {
    const trades = [...(db.snapshot.book.seeded ? SEED_TRADES : []), ...handTrades()].sort((a, b) => Date.parse(b.sold_at) - Date.parse(a.sold_at));
    const wins = trades.filter((t) => t.gain_try > 0).length;
    const days = trades.flatMap((t) => (t.days_held === null ? [] : [t.days_held]));
    const notes = [trades.some((t) => t.days_held === null) ? MSG_HAND_DAYS : "", trades.length > 0 && trades.length < FEW_SALES ? MSG_FEW_SALES : ""].filter(Boolean);
    return {
      trades,
      wins,
      losses: trades.filter((t) => t.gain_try < 0).length,
      win_rate_pct: trades.length ? r1((wins / trades.length) * 100) : null,
      total_gain_try: r2(trades.reduce((a, t) => a + t.gain_try, 0)),
      avg_days_held: days.length ? r1(days.reduce((a, d) => a + d, 0) / days.length) : null,
      note_tr: notes.join(" ") || null,
    };
  };

  const stats = (): ReturnStats => {
    const rows = [...sel.bookPnl(db.snapshot)].filter((p) => p.strategy === LIVE_STRATEGY).sort((a, b) => a.d.localeCompare(b.d));
    if (rows.length < 2) return { available: false, reason_tr: MSG_NEED_TWO_CLOSES, days: rows.length, from: null, to: null, twr_pct: null, best_day: null, worst_day: null, max_fall_pct: null, fall_from: null, fall_to: null, caveat_tr: null };
    let level = 1;
    let peak = 1;
    let peakDay = rows[0]?.d ?? "";
    let worstFall = 0;
    let fallFrom: string | null = null;
    let fallTo: string | null = null;
    for (const p of rows) {
      level *= 1 + p.daily_return;
      if (level > peak) {
        peak = level;
        peakDay = p.d;
      }
      if (level / peak - 1 < worstFall) {
        worstFall = level / peak - 1;
        fallFrom = peakDay;
        fallTo = p.d;
      }
    }
    const best = rows.reduce((a, b) => (b.daily_return > a.daily_return ? b : a));
    const worst = rows.reduce((a, b) => (b.daily_return < a.daily_return ? b : a));
    return {
      available: true,
      reason_tr: null,
      days: rows.length,
      from: rows[0]?.d ?? null,
      to: rows.at(-1)?.d ?? null,
      twr_pct: r2((level - 1) * 100),
      best_day: { d: best.d, pct: r2(best.daily_return * 100) },
      worst_day: { d: worst.d, pct: r2(worst.daily_return * 100) },
      max_fall_pct: r2(worstFall * 100),
      fall_from: fallFrom,
      fall_to: fallTo,
      caveat_tr: rows.length < ENOUGH_DAYS ? `Henüz ${rows.length} borsa günü var; bu rakamlar az güne bakıyor, çok bir şey söylemez.` : null,
    };
  };

  const dividends = (): DividendIncome => {
    const today = now().slice(0, 10);
    const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
    const months = Array.from({ length: 12 }, (_, n) => {
      const idx = year * 12 + month - 1 - (11 - n);
      return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
    });
    const rows = liveRows(db.snapshot.book.corporate).filter((r) => r.kind === "dividend" && r.net_try !== null);
    const sum = (f: (day: string) => boolean) => r2(rows.filter((r) => f(r.occurred_at.slice(0, 10))).reduce((a, r) => a + (r.net_try ?? 0), 0));
    const held = new Map(sel.positions(db.snapshot).map((p) => [p.ticker, p.qty * p.avg_cost]));
    const tickers = [...new Set(rows.filter((r) => months.includes(r.occurred_at.slice(0, 7))).map((r) => r.ticker))];
    const holdings = tickers
      .map((t) => {
        const got = r2(rows.filter((r) => r.ticker === t && months.includes(r.occurred_at.slice(0, 7))).reduce((a, r) => a + (r.net_try ?? 0), 0));
        const cost = held.get(t);
        return { ticker: t, company: findIssuer(t)?.name ?? t, last12_try: got, cost_try: cost ? r2(cost) : null, yield_on_cost_pct: cost ? r2((got / cost) * 100) : null };
      })
      .sort((a, b) => b.last12_try - a.last12_try);
    return {
      year,
      this_year_try: sum((d) => d.startsWith(`${year}-`)),
      last_year_try: sum((d) => d.startsWith(`${year - 1}-`)),
      total_try: sum(() => true),
      months: months.map((m) => ({ month: m, total_try: sum((d) => d.startsWith(m)) })),
      holdings,
    };
  };

  const versus = (): Versus => {
    const s = stats();
    if (!s.available) return { available: false, from: null, to: null, items: [], reason_tr: s.reason_tr };
    const item = (key: VersusItem["key"], label: string, pct: number | null, source: string | null, why: string | null): VersusItem => ({ key, label, pct, source_tr: source, hidden_reason_tr: why });
    return {
      available: true,
      from: s.from,
      to: s.to,
      reason_tr: null,
      items: [item("you", "Paran", s.twr_pct, "Kapanış kayıtların", null), item("usd", "Dolar", null, null, MSG_NO_DOLLAR), item("inflation", "Enflasyon", null, null, MSG_NO_OFFICIAL), item("deposit", "Mevduat faizi", null, null, MSG_NO_OFFICIAL)],
    };
  };

  const notesDoc = () => ({ notes: [...insights().notes].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map((n) => ({ ...n, company: findIssuer(n.ticker)?.name ?? n.ticker })) });
  const inBook = (ticker: string) => sel.positions(db.snapshot).some((p) => p.ticker === ticker) || db.snapshot.book.holdings.some((h) => h.ticker === ticker) || closed().trades.some((t) => t.ticker === ticker);

  return {
    async insightsAllocation() {
      ctx.me();
      return ok(allocation(), 80);
    },
    async setConcentration(pct) {
      const a = ctx.me();
      const input = parse(ConcentrationInput, { threshold_pct: pct });
      setInsights({ ...insights(), threshold_pct: input.threshold_pct });
      db.audit(userActor(a), "concentration.threshold_set", "preferences", "concentration", { threshold_pct: input.threshold_pct });
      return ok(allocation());
    },
    async closedTrades() {
      ctx.me();
      return ok(closed(), 80);
    },
    async returnStats() {
      ctx.me();
      return ok(stats(), 80);
    },
    async dividendIncome() {
      ctx.me();
      return ok(dividends(), 80);
    },
    async versusMoney() {
      ctx.me();
      return ok(versus(), 80);
    },
    async holdingNotes() {
      ctx.me();
      return ok(notesDoc(), 60);
    },
    async saveHoldingNote(ticker, body) {
      const a = ctx.me();
      const text = parse(HoldingNoteInput, { body }).body;
      if (!inBook(ticker)) throw new ApiError(404, "not_in_book", MSG_NOT_IN_BOOK);
      const rest = insights().notes.filter((n) => n.ticker !== ticker);
      setInsights({ ...insights(), notes: [...rest, { ticker, body: text, updated_at: now() }] });
      db.audit(userActor(a), "note.saved", "note", ticker, { ticker, company: findIssuer(ticker)?.name ?? ticker, chars: text.length });
      return ok(notesDoc());
    },
    async clearHoldingNote(ticker) {
      const a = ctx.me();
      if (!insights().notes.some((n) => n.ticker === ticker)) throw new ApiError(404, "no_note", MSG_NO_NOTE);
      setInsights({ ...insights(), notes: insights().notes.filter((n) => n.ticker !== ticker) });
      db.audit(userActor(a), "note.cleared", "note", ticker, { ticker, company: findIssuer(ticker)?.name ?? ticker });
      return ok(notesDoc());
    },
  };
}
