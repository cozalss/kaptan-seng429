import { HoldingInput, HoldingSellInput, MoneyInput, type MoneyMovement } from "@/lib/solo/money";
import { ApiError, type KaptanApi } from "../types";
import { parse, userActor, type MockCtx } from "./guard";
import { estimateCommission, hasStarted, ownHeld, type MockBook, type OwnHolding } from "./ledger";
import type { MockState } from "./state";
import * as sel from "./selectors";

/**
 * The person's own book in the test double (wave 3 contract §C): the starting money, deposits and
 * withdrawals, shares added by hand and their sale. Same answers, error codes and audit actions
 * as the backend; the arithmetic lives in ledger.ts.
 */
type Money = Pick<KaptanApi, "money" | "moveMoney" | "addHolding" | "sellHolding">;

const MSG_NOT_STARTED = "Önce başlangıç paranı gir.";
const AUDIT_ACTION = { start: "money.started", deposit: "money.deposited", withdrawal: "money.withdrawn" } as const;

const istDay = (iso: string) => new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(0, 10);
const withBook = (s: MockState, book: MockBook): MockState => ({ ...s, book });
const nextId = (prefix: string, taken: ReadonlyArray<{ id: string }>) => `${prefix}-${taken.length + 1}`;

export function createMoney(ctx: MockCtx): Money {
  const { db, ok, now } = ctx;

  return {
    async money() {
      ctx.me();
      return ok(sel.moneyBook(db.snapshot), 80);
    },

    async moveMoney(input) {
      const a = ctx.me();
      const m = parse(MoneyInput, input);
      const book = db.snapshot.book;
      const started = hasStarted(book);
      if (m.kind === "start" && started) throw new ApiError(409, "already_started", "Başlangıç paranı zaten girdin. Para eklemek için 'Para ekle'yi kullan.");
      if (m.kind !== "start" && !started) throw new ApiError(409, "not_started", MSG_NOT_STARTED);
      if (m.kind === "withdrawal" && m.amount_try > sel.bookOf(db.snapshot).cash) throw new ApiError(422, "over_cash", "Kasandaki paradan fazlasını çekemezsin.");
      const movement: MoneyMovement = { id: nextId("mv", book.movements), kind: m.kind, amount_try: m.amount_try, occurred_at: now(), note: m.note ?? "" };
      db.update((s) => withBook(s, { ...s.book, movements: [...s.book.movements, movement] }));
      db.audit(userActor(a), AUDIT_ACTION[m.kind], "money", movement.id, { amount_try: m.amount_try });
      return ok(sel.moneyBook(db.snapshot));
    },

    async addHolding(input) {
      const a = ctx.me();
      const h = parse(HoldingInput, input);
      if (!hasStarted(db.snapshot.book)) throw new ApiError(409, "not_started", MSG_NOT_STARTED);
      const company = sel.companyOf(h.ticker);
      if (!company) throw new ApiError(422, "unknown_ticker", "Bu hisse kodunu tanımıyorum.");
      const at = now();
      if (h.bought_on > istDay(at)) throw new ApiError(422, "validation", "Alış günü bugünden sonra olamaz.");
      const book = db.snapshot.book;
      const holding: OwnHolding = { id: nextId("own", book.holdings), ticker: h.ticker, company_name: company.name, qty: h.qty, avg_cost: h.avg_cost, bought_on: h.bought_on, added_at: at, price_at_add: company.price, sales: [] };
      const movement: MoneyMovement = { id: nextId("mv", book.movements), kind: "holding", amount_try: Math.round(h.qty * h.avg_cost * 100) / 100, occurred_at: at, note: h.ticker };
      db.update((s) => withBook(s, { ...s.book, holdings: [...s.book.holdings, holding], movements: [...s.book.movements, movement] }));
      db.audit(userActor(a), "holding.added", "position", holding.id, { ticker: h.ticker, company: company.name, qty: h.qty, avg_cost: h.avg_cost });
      const added = sel.positions(db.snapshot).find((p) => p.id === holding.id);
      if (!added) throw new ApiError(500, "server", "Hisse eklenemedi.");
      return ok(added);
    },

    async sellHolding(positionId, input) {
      const a = ctx.me();
      const s = parse(HoldingSellInput, input);
      const held = sel.positions(db.snapshot).find((p) => p.id === positionId);
      if (!held) throw new ApiError(404, "not_found", "Bu hisse elinde görünmüyor.");
      if (held.origin !== "own") throw new ApiError(409, "not_own", "Bunu KAPtan önermişti; satışını da önerisinden kaydedersin.");
      if (s.qty > ownHeld(db.snapshot.book, positionId)) throw new ApiError(422, "over_qty", "Elindekinden fazlasını satamazsın.");
      const at = now();
      if (Date.parse(s.sold_at) > Date.parse(at) + 60_000) throw new ApiError(422, "validation", "Satış zamanı şimdiden sonra olamaz.");
      const commission = s.commission_try ?? estimateCommission(s.qty, s.price);
      const sale = { qty: s.qty, price: s.price, commission, at: s.sold_at };
      db.update((st) => withBook(st, { ...st.book, holdings: st.book.holdings.map((h) => (h.id === positionId ? { ...h, sales: [...h.sales, sale] } : h)) }));
      db.audit(userActor(a), "holding.sold", "position", positionId, { ticker: held.ticker, company: held.company_name, qty: s.qty, price: s.price, commission_try: commission });
      return ok(sel.positions(db.snapshot).find((p) => p.id === positionId) ?? null);
    },
  };
}
