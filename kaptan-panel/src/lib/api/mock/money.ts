import { TicketCorrectInput } from "@/lib/domain";
import { BookResetInput, BrokerFeeInput, HoldingInput, HoldingSellInput, MoneyInput, MovementCorrectInput, RESET_WORD, type BrokerFee, type MoneyBook, type MoneyMovement, type PreviousBook } from "@/lib/solo/money";
import { ApiError, type KaptanApi } from "../types";
import { parse, userActor, type MockCtx } from "./guard";
import { COMMISSION_RATE, commissionFor, feeInForce, hasStarted, movementsOf, ownHeld, signedAmount, type MockBook, type OwnHolding, type StoredMovement } from "./ledger";
import type { MockState } from "./state";
import * as sel from "./selectors";

/**
 * The person's own book in the test double (wave 3 contract §C): the starting money, deposits and
 * withdrawals, shares added by hand and their sale. Same answers, error codes and audit actions
 * as the backend; the arithmetic lives in ledger.ts.
 */
type Money = Pick<KaptanApi, "money" | "moveMoney" | "addHolding" | "sellHolding" | "correctMovement" | "undoMovement" | "correctFill" | "brokerFee" | "setBrokerFee" | "startOver" | "previousBooks" | "exportRecords">;

const MSG_NOT_STARTED = "Önce başlangıç paranı gir.";
const AUDIT_ACTION = { start: "money.started", deposit: "money.deposited", withdrawal: "money.withdrawn" } as const;

const istDay = (iso: string) => new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(0, 10);
const withBook = (s: MockState, book: MockBook): MockState => ({ ...s, book });
const nextId = (prefix: string, taken: ReadonlyArray<{ id: string }>) => `${prefix}-${taken.length + 1}`;
const cents = (n: number) => Math.round(n * 100) / 100;
const MSG_OVER_CASH_FIX = "Bu değişiklikle boştaki nakdin eksiye düşerdi. Önce bekleyen alım işlemini kapat ya da başka bir tutar yaz.";
const MSG_NO_CHANGE = "Bu zaten böyle yazılı.";
const MSG_ALREADY_UNDONE = "Bunu zaten geri aldın.";
const MSG_HAS_SALES = "Bu hisseden sattığını kaydettin, o yüzden eklemeyi değiştiremezsin.";
const MSG_START_NOT_UNDOABLE = "Başlangıç parasını geri alamazsın; tutarını değiştirebilirsin. Hepsini silip yeniden başlamak için 'Baştan başla'yı kullan.";

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
      const movement: StoredMovement = { id: nextId("mv", book.movements), kind: m.kind, amount_try: m.amount_try, occurred_at: now(), note: m.note ?? "" };
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
      const movement: StoredMovement = { id: nextId("mv", book.movements), kind: "holding", amount_try: Math.round(h.qty * h.avg_cost * 100) / 100, occurred_at: at, note: h.ticker };
      const holding: OwnHolding = { id: nextId("own", book.holdings), ticker: h.ticker, company_name: company.name, qty: h.qty, avg_cost: h.avg_cost, bought_on: h.bought_on, added_at: at, price_at_add: company.price, sales: [], movement_id: movement.id };
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
      const commission = commissionFor(db.snapshot.book, s.commission_try, s.qty, s.price).amount;
      const sale = { qty: s.qty, price: s.price, commission, at: s.sold_at };
      db.update((st) => withBook(st, { ...st.book, holdings: st.book.holdings.map((h) => (h.id === positionId ? { ...h, sales: [...h.sales, sale] } : h)) }));
      db.audit(userActor(a), "holding.sold", "position", positionId, { ticker: held.ticker, company: held.company_name, qty: s.qty, price: s.price, commission_try: commission });
      return ok(sel.positions(db.snapshot).find((p) => p.id === positionId) ?? null);
    },

    async correctMovement(movementId, input) {
      const a = ctx.me();
      const c = parse(MovementCorrectInput, input);
      const book = db.snapshot.book;
      const row = movementsOf(book).find((m) => m.id === movementId);
      if (!row) throw new ApiError(404, "not_found", "Bu hareketi bulamadım.");
      if (row.status === "undone") throw new ApiError(409, "already_undone", MSG_ALREADY_UNDONE);
      if (row.kind === "holding") return ok(fixHolding(row, c, a), 80);
      if (c.amount_try === undefined) throw new ApiError(422, "validation", "Yeni tutarı yaz.");
      const next = cents(c.amount_try);
      if (next === row.amount_try) throw new ApiError(422, "no_change", MSG_NO_CHANGE);
      const delta = signedAmount({ kind: row.kind, amount_try: next }) - signedAmount(row);
      if (delta < 0 && sel.bookOf(db.snapshot).cash + delta < 0) throw new ApiError(422, "over_cash", MSG_OVER_CASH_FIX);
      db.update((s) => withBook(s, { ...s.book, corrections: { ...s.book.corrections, [movementId]: { amount_try: next, at: now() } } }));
      db.audit(userActor(a), "money.corrected", "book", movementId, { kind: row.kind, old_amount_try: row.amount_try, new_amount_try: next });
      return ok(sel.moneyBook(db.snapshot));
    },

    async undoMovement(movementId) {
      const a = ctx.me();
      const book = db.snapshot.book;
      const row = movementsOf(book).find((m) => m.id === movementId);
      if (!row) throw new ApiError(404, "not_found", "Bu hareketi bulamadım.");
      if (row.status === "undone") throw new ApiError(409, "already_undone", MSG_ALREADY_UNDONE);
      if (row.kind === "start") throw new ApiError(409, "cannot_undo_start", MSG_START_NOT_UNDOABLE);
      const holding = book.holdings.find((h) => h.movement_id === movementId);
      if (holding && holding.sales.length > 0) throw new ApiError(409, "has_sales", MSG_HAS_SALES);
      if (!holding && signedAmount(row) > 0 && sel.bookOf(db.snapshot).cash - signedAmount(row) < 0) throw new ApiError(422, "over_cash", MSG_OVER_CASH_FIX);
      db.update((s) => withBook(s, { ...s.book, undone: { ...s.book.undone, [movementId]: now() } }));
      if (holding) db.audit(userActor(a), "holding.undone", "book", movementId, { ticker: holding.ticker, company: holding.company_name, qty: holding.qty, avg_cost: holding.avg_cost });
      else db.audit(userActor(a), "money.undone", "book", movementId, { kind: row.kind, amount_try: row.amount_try });
      return ok(sel.moneyBook(db.snapshot));
    },

    async correctFill(ticketNo, input) {
      const a = ctx.me();
      const c = parse(TicketCorrectInput, input);
      const ticket = sel.allTickets(db.snapshot).find((t) => t.ticket_no === ticketNo);
      if (!ticket) throw new ApiError(404, "not_found", "İşlem bulunamadı.");
      const old = ticket.entry;
      if (old.status !== "entered" || !old.filled_qty || !old.avg_price) throw new ApiError(409, "not_entered", "Önce işlemi girdim diye işaretlemelisin.");
      if (c.filled_qty > ticket.qty) throw new ApiError(422, "over_qty", "Gerçekleşen adet, yazılan adetten büyük olamaz.");
      if (ticket.side === "sell") {
        if (c.avg_price < ticket.limit_price) throw new ApiError(422, "under_limit", "Satış fiyatı, en az istediğin fiyatın altında olamaz.");
        if (c.filled_qty !== old.filled_qty) throw new ApiError(422, "sell_qty", "Satışta adedi değiştiremezsin; fiyatı ve komisyonu düzeltebilirsin.");
      } else if (c.avg_price > ticket.limit_price) throw new ApiError(422, "over_limit", "Alış fiyatı, en fazla ödeyeceğin fiyatı aşamaz.");
      const charged = commissionFor(db.snapshot.book, c.commission_try, c.filled_qty, c.avg_price);
      if (c.filled_qty === old.filled_qty && c.avg_price === old.avg_price && charged.amount === old.commission_try) throw new ApiError(422, "no_change", MSG_NO_CHANGE);
      const entry = { ...old, filled_qty: c.filled_qty, avg_price: c.avg_price, commission_try: charged.amount, commission_estimated: charged.estimated, commission_rate: charged.rate, commission_rate_own: charged.own, corrected: true };
      db.update((s) => ({ ...s, ticketMarks: { ...s.ticketMarks, [ticketNo]: entry } }));
      db.audit(userActor(a), "ticket.corrected", "order_ticket", ticketNo, { side: ticket.side, old: { qty: old.filled_qty, price: old.avg_price, commission_try: old.commission_try }, new: { qty: c.filled_qty, price: c.avg_price, commission_try: charged.amount } }, ticket.run_id);
      const updated = { ...ticket, entry };
      db.bus.emit("desk", "ticket", updated);
      return ok(updated);
    },

    async brokerFee() {
      ctx.me();
      return ok(feeView(db.snapshot.book), 60);
    },

    async setBrokerFee(input) {
      const a = ctx.me();
      const f = parse(BrokerFeeInput, input);
      const before = db.snapshot.book.fee ?? null;
      db.update((s) => withBook(s, { ...s.book, fee: f.commission_rate }));
      db.audit(userActor(a), "fee.changed", "book", "komisyon", { old_rate: before, new_rate: f.commission_rate });
      return ok(feeView(db.snapshot.book));
    },

    async startOver(input) {
      const a = ctx.me();
      const w = parse(BookResetInput, input);
      if (w.confirm.trim().toLocaleLowerCase("tr-TR") !== RESET_WORD) throw new ApiError(422, "confirm", "Onay kelimesini yanlış yazdın. “baştan” yaz.");
      if (!hasStarted(db.snapshot.book)) throw new ApiError(409, "not_started", "Başlangıç paranı henüz girmedin; baştan başlayacak bir şey yok.");
      const closed = closeBook(db.snapshot, now());
      const killOn = db.snapshot.risk.kill_switch === "on";
      db.update((s) => ({
        ...s,
        // The kill switch is a safety rule, not a number of the old book: it stays as it is.
        risk: { ...s.risk, daily_pnl_pct: 0, drawdown_pct: 0, halted_today: false },
        book: { seeded: false, movements: [], holdings: [], corrections: {}, undone: {}, fee: s.book.fee ?? null, previous: [closed, ...(s.book.previous ?? [])] },
      }));
      db.audit(userActor(a), "book.reset", "book", `defter-${closed.no}`, { closed_book: closed.no, equity: closed.equity, cash: closed.cash, put_in: closed.put_in, kill_switch_stays_on: killOn });
      return ok({ closed_book: closed.no, kill_switch_on: killOn });
    },

    async previousBooks() {
      ctx.me();
      return ok([...(db.snapshot.book.previous ?? [])]);
    },

    async exportRecords() {
      ctx.me();
      return ok({ filename: `kayitlarim-${now().slice(0, 10)}.csv`, blob: new Blob([recordsCsv(db.snapshot)], { type: "text/csv;charset=utf-8" }) });
    },
  };

  /** A hand-entered holding: its adet and cost fixed; a sold-from holding cannot be. */
  function fixHolding(row: MoneyMovement, c: MovementCorrectInput, a: ReturnType<typeof ctx.me>): MoneyBook {
    const holding = db.snapshot.book.holdings.find((h) => h.movement_id === row.id);
    if (!holding) throw new ApiError(404, "not_found", "Bu hareketi bulamadım.");
    if (holding.sales.length > 0) throw new ApiError(409, "has_sales", MSG_HAS_SALES);
    if (c.qty === undefined || c.avg_cost === undefined) throw new ApiError(422, "validation", "Yeni adedi ve alış fiyatını yaz.");
    if (c.bought_on !== undefined && c.bought_on > istDay(now())) throw new ApiError(422, "future_date", "Gelecekteki bir tarihi giremezsin.");
    if (c.qty === holding.qty && c.avg_cost === holding.avg_cost && c.bought_on === undefined) throw new ApiError(422, "no_change", MSG_NO_CHANGE);
    const cost = cents(c.qty * c.avg_cost);
    const { qty, avg_cost: avg } = c;
    db.update((s) =>
      withBook(s, {
        ...s.book,
        holdings: s.book.holdings.map((h) => (h.id === holding.id ? { ...h, qty, avg_cost: avg, bought_on: c.bought_on ?? h.bought_on } : h)),
        corrections: { ...s.book.corrections, [row.id]: { amount_try: cost, at: now() } },
      }),
    );
    db.audit(userActor(a), "holding.corrected", "book", row.id, { ticker: holding.ticker, company: holding.company_name, old: { qty: holding.qty, avg_cost: holding.avg_cost }, new: { qty, avg_cost: avg } });
    return sel.moneyBook(db.snapshot);
  }
}

function feeView(book: MockBook): BrokerFee {
  const { rate, own } = feeInForce(book);
  return { commission_rate: rate, default_rate: COMMISSION_RATE, bsmv: 0.05, own };
}

/** What the book looked like when it was closed (the double's "önceki defter"). */
function closeBook(s: MockState, closedAt: string): PreviousBook {
  const view = sel.bookOf(s);
  const movements = movementsOf(s.book);
  const start = movements.find((m) => m.kind === "start");
  return {
    no: (s.book.previous?.length ?? 0) + 1,
    opened_at: movements.at(-1)?.occurred_at ?? closedAt,
    closed_at: closedAt,
    started_with: start?.amount_try ?? 0,
    put_in: view.put_in,
    cash: view.cash,
    equity: view.equity,
    movements,
    positions: view.positions.map((p) => ({ ticker: p.ticker, qty: p.qty, avg_cost: p.avg_cost })),
  };
}

/** The records file as the backend writes it: BOM, `;`, decimal comma, text that a spreadsheet will not run as a formula. */
function recordsCsv(s: MockState): string {
  const num = (n: number) => n.toFixed(2).replace(".", ",");
  const text = (t: string) => {
    const clean = t.replace(/\s+/g, " ").trim();
    const safe = /^[=+\-@]/.test(clean) ? `'${clean}` : clean;
    return /[;"]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const kinds = { start: "Başlangıç parası", deposit: "Para ekledim", withdrawal: "Para çektim", holding: "Elimdeki hisse" } as const;
  const status = { active: "Geçerli", corrected: "Düzeltildi", undone: "Geri alındı" } as const;
  const head = ["Defter", "Kayıt no", "Tarih", "Tür", "Hisse", "Adet", "Fiyat (₺)", "Tutar (₺)", "Komisyon (₺)", "Komisyon tahmin mi", "Nakit etkisi (₺)", "Durum", "Düzelttiği kayıt no", "Not"].join(";");
  const rows = movementsOf(s.book).map((m) => {
    const cash = m.kind === "holding" ? 0 : signedAmount(m);
    return [1, m.id, istStamp(m.occurred_at), text(kinds[m.kind]), "", "", "", num(m.original_amount_try ?? m.amount_try), "", "", num(cash), text(status[m.status]), "", text(m.note)].join(";");
  });
  return `﻿${[head, ...rows].join("\r\n")}\r\n`;
}

/** "11.01.2027 14:05" in Istanbul time, as the file writes it. */
function istStamp(iso: string): string {
  const d = new Date(Date.parse(iso) + 3 * 3_600_000).toISOString();
  return `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)} ${d.slice(11, 16)}`;
}
