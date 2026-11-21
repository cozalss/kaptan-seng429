import type { Position } from "@/lib/domain";
import type { MoneyMovement, PreviousBook } from "@/lib/solo/money";
import { corporateCash, extrasOf, type CorporateRow } from "./corporate-ledger";

/**
 * The test double's one book, as arithmetic (wave 3 contract §C): the money the person put in,
 * the shares they added by hand, and what every recorded fill did to the cash. Pure functions
 * over plain data; selectors.ts feeds them the fixtures.
 *
 * Two starts. A "seeded" book reads as a person who began with 1.000.000 ₺ in November and
 * holds the fixture's shares; a fresh one has no starting money yet (`needs_setup`).
 */
export const SEED_START_TRY = 1_000_000;
/** The Friday before the seeded book's first market day. */
export const SEED_STARTED_AT = "2026-11-20T06:30:00.000Z";
/** What the double "estimates" when the person leaves the bank's commission empty: 2 per thousand. */
export const COMMISSION_RATE = 0.002;

const cents = (n: number) => Math.round(n * 100) / 100;

export function estimateCommission(qty: number, price: number, rate: number = COMMISSION_RATE): number {
  return cents(qty * price * rate);
}

/** The commission rate in force: yours when you entered one, else the double's built-in one. */
export function feeInForce(book: Pick<MockBook, "fee">): { rate: number; own: boolean } {
  const own = book.fee ?? null;
  return own === null ? { rate: COMMISSION_RATE, own: false } : { rate: own, own: true };
}

/** A fill's commission as typed, else estimated at the rate in force (and says which rate it used). */
export function commissionFor(book: Pick<MockBook, "fee">, typed: number | undefined, qty: number, price: number) {
  if (typed !== undefined) return { amount: typed, estimated: false, rate: null, own: false };
  const { rate, own } = feeInForce(book);
  return { amount: estimateCommission(qty, price, rate), estimated: true, rate, own };
}

export interface OwnSale {
  qty: number;
  price: number;
  commission: number;
  at: string;
}

/** A share the person already held and entered by hand. */
export interface OwnHolding {
  id: string;
  ticker: string;
  company_name: string;
  qty: number;
  avg_cost: number;
  bought_on: string;
  added_at: string;
  /** Its market price when it joined: the day's change is measured from there, not from its old cost. */
  price_at_add: number;
  sales: OwnSale[];
  /** The movement this holding wrote into the list (so an undo finds it). */
  movement_id?: string;
}

/** A movement as stored; the list adds what was fixed (movementsOf). */
export type StoredMovement = Pick<MoneyMovement, "id" | "kind" | "amount_try" | "occurred_at" | "note">;

export interface MockBook {
  /** False on a fresh install: no starting money, no fixture holdings. */
  seeded: boolean;
  /** What this session added, oldest first (the seeded start is not stored: it is derived). */
  movements: StoredMovement[];
  holdings: OwnHolding[];
  /** Movements whose amount was corrected, by movement id: the amount in force and when. */
  corrections?: Record<string, { amount_try: number; at: string }>;
  /** Movements that were undone, by movement id: when. */
  undone?: Record<string, string>;
  /** Your own commission rate (a fraction); null or missing = the built-in one. */
  fee?: number | null;
  /** Books closed by starting over, newest first. */
  previous?: PreviousBook[];
  /** Dividends, bonus and rights issues the person recorded (corporate-ledger.ts), oldest first. */
  corporate?: CorporateRow[];
  /** What was done with a KAP notice about a company action, by notice id. */
  notices?: Record<string, "recorded" | "dismissed">;
}

export function initialBook(fresh: boolean): MockBook {
  return { seeded: !fresh, movements: [], holdings: [] };
}

/** A recorded fill of a suggestion's order, as the cash sees it. */
export interface BookFill {
  side: "buy" | "sell";
  qty: number;
  price: number;
  commission: number;
}

/** A withdrawal takes money out; everything else puts it in. */
export function signedAmount(m: Pick<MoneyMovement, "kind" | "amount_try">): number {
  return m.kind === "withdrawal" ? -m.amount_try : m.amount_try;
}

/** Every movement of the book, newest first, a corrected or undone one marked as such (never hidden). */
export function movementsOf(book: MockBook): MoneyMovement[] {
  const seed: StoredMovement[] = book.seeded ? [{ id: "mv-0", kind: "start", amount_try: SEED_START_TRY, occurred_at: SEED_STARTED_AT, note: "" }] : [];
  return [...seed, ...book.movements]
    .map((m): MoneyMovement => {
      const fix = book.corrections?.[m.id];
      const undone = book.undone?.[m.id];
      return {
        ...m,
        amount_try: fix?.amount_try ?? m.amount_try,
        status: undone ? "undone" : fix ? "corrected" : "active",
        original_amount_try: fix ? m.amount_try : null,
        changed_at: undone ?? fix?.at ?? null,
      };
    })
    .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
}

/** The movements that still count: an undone one is out. */
const liveMovements = (book: MockBook) => movementsOf(book).filter((m) => m.status !== "undone");

/** Money moved by hand that is not in the fixture's own cash: everything but the seeded start as it was. */
const movedByHand = (book: MockBook) =>
  liveMovements(book)
    .filter((m) => m.kind !== "holding")
    .reduce((sum, m) => sum + signedAmount(m), 0) - (book.seeded ? SEED_START_TRY : 0);

/** Has the person entered their starting money? */
export function hasStarted(book: MockBook): boolean {
  return book.seeded || book.movements.some((m) => m.kind === "start");
}

/** Money put in so far: start + deposits − withdrawals + the cost of shares added by hand. */
export function putInOf(book: MockBook): number {
  return cents(liveMovements(book).reduce((sum, m) => sum + signedAmount(m), 0));
}

const heldQty = (book: MockBook, h: OwnHolding) => (book.undone?.[h.movement_id ?? ""] ? 0 : h.qty + extrasOf(book.corporate, h.id).qty - h.sales.reduce((s, x) => s + x.qty, 0));

/**
 * Free cash: what the seeded book had, the money moved in and out by hand, every buy taken out
 * with its commission, every sale put back less its commission. A share added by hand never
 * touches it.
 */
export function cashOf(book: MockBook, seedCash: number, fills: readonly BookFill[]): number {
  const moved = movedByHand(book);
  const traded = fills.reduce((sum, f) => sum + (f.side === "buy" ? -(f.qty * f.price + f.commission) : f.qty * f.price - f.commission), 0);
  const ownSales = book.holdings.flatMap((h) => h.sales).reduce((sum, s) => sum + s.qty * s.price - s.commission, 0);
  return cents(seedCash + moved + traded + ownSales + corporateCash(book.corporate));
}

/**
 * What this session moved into or out of the book that is not a gain or a loss: money by hand,
 * and a hand-entered share at the price it joined with. The day's start and the peak shift by it.
 */
export function flowsOf(book: MockBook): number {
  const moved = movedByHand(book);
  const joined = book.holdings.filter((h) => !book.undone?.[h.movement_id ?? ""]).reduce((sum, h) => sum + h.qty * h.price_at_add, 0);
  return cents(moved + joined);
}

export interface DayFigures {
  daily_pnl_pct: number;
  peak_equity: number;
  drawdown_pct: number;
}

/**
 * Today's change, the peak and the fall from it, with the flows taken out: a deposit raises the
 * day's starting level and the peak by the same lira, so neither the day's P&L nor the two stops
 * move because of it. With an untouched book the fixture's own figures stand.
 */
export function dayFigures(input: { equity: number; seedEquity: number; seedDaily: number; seedPeak: number; seedDrawdown: number; flows: number; touched: boolean }): DayFigures {
  const { equity, seedEquity, seedDaily, seedPeak, seedDrawdown, flows, touched } = input;
  if (!touched) return { daily_pnl_pct: seedDaily, peak_equity: seedPeak, drawdown_pct: seedDrawdown };
  const dayStart = seedEquity / (1 + seedDaily) + flows;
  const peak = Math.max(seedPeak + flows, equity);
  return {
    daily_pnl_pct: dayStart > 0 ? Math.round(((equity - dayStart) / dayStart) * 1e6) / 1e6 : 0,
    peak_equity: cents(peak),
    drawdown_pct: peak > 0 ? Math.min(0, Math.round((equity / peak - 1) * 1e6) / 1e6) : 0,
  };
}

/** What the average cost is once bonus shares (more shares, same cost) and rights shares (paid) joined. */
const avgCostOf = (book: MockBook, h: OwnHolding) => {
  const extra = extrasOf(book.corporate, h.id);
  return extra.qty === 0 ? h.avg_cost : Math.round(((h.avg_cost * h.qty + extra.cost) / (h.qty + extra.qty)) * 1e6) / 1e6;
};

/** The hand-entered holdings that still hold something, as positions at the given prices. */
export function ownPositions(book: MockBook, opts: { nowMs: number; priceOf: (ticker: string) => number; priceAsOf: string; managedByExit: boolean }): Position[] {
  return book.holdings.flatMap((h): Position[] => {
    const qty = heldQty(book, h);
    if (qty <= 0) return [];
    // A bonus issue lowers the share price by what it adds in shares: like with like, so it is no loss.
    const last = Math.round(opts.priceOf(h.ticker) * (h.qty / (h.qty + extrasOf(book.corporate, h.id).bonus)) * 100) / 100;
    const opened = `${h.bought_on}T07:00:00.000Z`;
    return [
      {
        id: h.id,
        origin: "own",
        ticker: h.ticker,
        company_name: h.company_name,
        qty,
        avg_cost: avgCostOf(book, h),
        last_price: last,
        opened_at: opened,
        planned_exit_date: h.bought_on,
        holding_days: Math.max(0, Math.round((opts.nowMs - Date.parse(opened)) / 86_400_000)),
        source_proposal: "",
        run_id: "",
        event_type: "IGNORE",
        strategy_version: "",
        unrealized_pnl: cents((last - avgCostOf(book, h)) * qty),
        realized_pnl: cents(h.sales.reduce((s, x) => s + (x.price - h.avg_cost) * x.qty - x.commission, 0)),
        managed_by_exit_rule: opts.managedByExit,
        book: "personal",
        price_as_of: opts.priceAsOf,
      },
    ];
  });
}

/** How many of a hand-entered holding are still held (0 once sold out). */
export function ownHeld(book: MockBook, id: string): number {
  const h = book.holdings.find((x) => x.id === id);
  return h ? heldQty(book, h) : 0;
}

/** The oldest "known at" among the prices in use; null with no holdings. */
export function oldestPrice(positions: ReadonlyArray<Pick<Position, "price_as_of">>): string | null {
  const known = positions.map((p) => p.price_as_of).filter((t): t is string => t !== null);
  return known.length ? known.reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b)) : null;
}
