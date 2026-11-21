import { LIVE_STRATEGY } from "@/mocks/pnl";
import { istanbulDay } from "@/lib/session-day";
import { closedTradesOf, saleCommissionsOf } from "./insights";
import { movementsOf, signedAmount } from "./ledger";
import type { MockState } from "./state";
import * as sel from "./selectors";

const r2 = (n: number) => Math.round(n * 100) / 100;
const dayOf = (iso: string) => istanbulDay(Date.parse(iso));

export interface PeriodMoney {
  put_in_net: number;
  value_start: number | null;
  value_end: number | null;
  gain_try: number | null;
  realized_try: number;
  unrealized_try: number | null;
  commissions_try: number;
}

/**
 * The money of one period (a Karne month or year, a Haftalık week), the way the backend reads it: only the
 * money put in during the period, the value at the close before it began (0 when the money started inside it),
 * the gain as end − start − money put in, the sales of the period, and what is still open in the holdings
 * (current period only; the same sum Param shows). So Karne, Haftalık and Param tell one story.
 */
export function periodMoney(state: MockState, start: string, end: string, current: boolean, realNow?: number): PeriodMoney {
  const book = sel.bookOf(state, realNow);
  const inPeriod = (iso: string) => {
    const d = dayOf(iso);
    return d >= start && d <= end;
  };
  const moved = movementsOf(state.book).filter((m) => m.status !== "undone" && inPeriod(m.occurred_at));
  const put_in_net = r2(moved.reduce((s, m) => s + signedAmount(m), 0));
  const startedBefore = movementsOf(state.book).some((m) => m.status !== "undone" && m.kind === "start" && dayOf(m.occurred_at) < start);
  const closes = sel.bookPnl(state).filter((p) => p.strategy === LIVE_STRATEGY);
  const closeBefore = (day: string) => closes.filter((p) => p.d < day).at(-1)?.equity ?? null;
  const value_start = !book.started ? null : startedBefore ? (closeBefore(start) ?? book.put_in - put_in_net) : 0;
  const value_end = !book.started ? null : current ? book.equity : (closes.filter((p) => p.d <= end).at(-1)?.equity ?? null);
  const gain_try = value_start === null || value_end === null ? null : r2(value_end - value_start - put_in_net);
  const realized_try = r2(closedTradesOf(state.book).filter((t) => inPeriod(t.sold_at)).reduce((s, t) => s + t.gain_try, 0));
  const commissions_try = r2(saleCommissionsOf(state.book).filter((c) => inPeriod(c.at)).reduce((s, c) => s + c.commission, 0));
  const unrealized_try = current && book.started ? r2(book.positions.reduce((s, p) => s + p.unrealized_pnl, 0)) : null;
  return { put_in_net, value_start, value_end, gain_try, realized_try, unrealized_try, commissions_try };
}
