import { PENDING_PROPOSALS } from "@/mocks/ids";
import { createMockApi } from "./mock-api";
import { MockDb } from "./db";
import { stopAllTimers, stopLiveTicker } from "./scenarios";
import { SEED_START_TRY } from "./ledger";
import * as sel from "./selectors";
import { isApiError } from "../types";

function setup(fresh = false) {
  const db = new MockDb(null, Date.now(), fresh);
  const api = createMockApi({ db, latencyMs: 0, live: false });
  return { db, api };
}

async function errorOf(p: Promise<unknown>): Promise<{ status: number; code: string }> {
  try {
    await p;
  } catch (e) {
    if (isApiError(e)) return { status: e.status, code: e.code };
    throw e;
  }
  throw new Error("expected an error");
}

/** jsdom's Blob has no .text() and a text read drops the BOM: read the bytes, as a download would hold them. */
const readBytes = (blob: Blob) =>
  new Promise<Uint8Array>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });

function head<T>(rows: readonly T[]): T {
  const first = rows[0];
  if (first === undefined) throw new Error("empty list");
  return first;
}

const lastAudit = (db: MockDb) => db.snapshot.auditAppends.at(-1);

afterEach(() => {
  stopAllTimers();
  stopLiveTicker();
});

describe("mock · correct the starting money", () => {
  it("changes the starting amount up and down; cash and put in follow, the row says it was corrected", async () => {
    const { api, db } = setup(true);
    const start = head((await api.moveMoney({ kind: "start", amount_try: 10_000 })).movements);
    const up = await api.correctMovement(start.id, { amount_try: 15_000 });
    expect([up.cash, up.put_in]).toEqual([15_000, 15_000]);
    expect(head(up.movements)).toMatchObject({ status: "corrected", amount_try: 15_000, original_amount_try: 10_000 });
    expect(lastAudit(db)).toMatchObject({ action: "money.corrected", payload: { old_amount_try: 10_000, new_amount_try: 15_000 } });
    const down = await api.correctMovement(start.id, { amount_try: 4_000 });
    expect([down.cash, down.put_in]).toEqual([4_000, 4_000]);
    expect(await errorOf(api.correctMovement(start.id, { amount_try: 4_000 }))).toMatchObject({ code: "no_change" });
  });

  it("is never a gain or a loss: the day's change and the stops do not move", async () => {
    const { api, db } = setup(true);
    const start = head((await api.moveMoney({ kind: "start", amount_try: 10_000 })).movements);
    const before = sel.bookOf(db.snapshot);
    await api.correctMovement(start.id, { amount_try: 20_000 });
    const after = sel.bookOf(db.snapshot);
    expect(after.equity).toBe(20_000);
    expect([after.daily_pnl_pct, after.drawdown_pct]).toEqual([before.daily_pnl_pct, before.drawdown_pct]);
  });

  it("works on the seeded book too, and refuses a change that would take cash below zero", async () => {
    const { api } = setup();
    const before = (await api.money()).cash;
    const fixed = await api.correctMovement("mv-0", { amount_try: SEED_START_TRY + 1_000 });
    expect(fixed.cash).toBe(before + 1_000);
    expect(await errorOf(api.correctMovement("mv-0", { amount_try: 1 }))).toMatchObject({ status: 422, code: "over_cash" });
  });
});

describe("mock · undo a movement", () => {
  it("takes a deposit back, keeps it in the list as undone, and refuses to undo twice or to undo the start", async () => {
    const { api, db } = setup(true);
    const first = await api.moveMoney({ kind: "start", amount_try: 10_000 });
    const added = await api.moveMoney({ kind: "deposit", amount_try: 3_000 });
    const deposit = added.movements.find((m) => m.kind === "deposit");
    expect(deposit).toBeDefined();
    const undone = await api.undoMovement(deposit?.id ?? "");
    expect([undone.cash, undone.put_in]).toEqual([10_000, 10_000]);
    expect(undone.movements.find((m) => m.kind === "deposit")).toMatchObject({ status: "undone", amount_try: 3_000 });
    expect(lastAudit(db)).toMatchObject({ action: "money.undone" });
    expect(await errorOf(api.undoMovement(deposit?.id ?? ""))).toMatchObject({ status: 409, code: "already_undone" });
    expect(await errorOf(api.undoMovement(head(first.movements).id))).toMatchObject({ status: 409, code: "cannot_undo_start" });
  });
});

describe("mock · fix a recorded fill", () => {
  async function entered(api: ReturnType<typeof setup>["api"]) {
    await api.decideApproval(PENDING_PROPOSALS[0], { decision: "approve", approved_notional_try: null, comment: "" });
    const t = (await api.listTickets()).find((x) => x.proposal_id === PENDING_PROPOSALS[0]);
    if (!t) throw new Error("no ticket");
    const at = new Date(Date.parse(t.valid_until) - 60_000).toISOString();
    await api.markTicket(t.ticket_no, { mark: "entered", filled_qty: t.qty, avg_price: t.limit_price, filled_at: at, commission_try: 20 });
    return t;
  }

  it("recomputes cash, keeps the ticket's rules and writes ticket.corrected", async () => {
    const { api, db } = setup();
    const t = await entered(api);
    const cashBefore = (await api.money()).cash;
    const qty = Math.max(1, t.qty - 1);
    const fixed = await api.correctFill(t.ticket_no, { filled_qty: qty, avg_price: t.limit_price, commission_try: 10 });
    expect(fixed.entry).toMatchObject({ filled_qty: qty, commission_try: 10, commission_estimated: false, corrected: true });
    const cashAfter = (await api.money()).cash;
    expect(cashAfter).toBeCloseTo(cashBefore + t.limit_price * (t.qty - qty) + 10, 2);
    expect(lastAudit(db)).toMatchObject({ action: "ticket.corrected" });
    expect(await errorOf(api.correctFill(t.ticket_no, { filled_qty: t.qty + 1, avg_price: t.limit_price }))).toMatchObject({ code: "over_qty" });
    expect(await errorOf(api.correctFill(t.ticket_no, { filled_qty: qty, avg_price: t.limit_price + 5 }))).toMatchObject({ code: "over_limit" });
    expect(await errorOf(api.correctFill(t.ticket_no, { filled_qty: qty, avg_price: t.limit_price, commission_try: 10 }))).toMatchObject({ code: "no_change" });
  });
});

describe("mock · my broker's commission rate", () => {
  it("is used for estimates and the entry says which rate it used", async () => {
    const { api, db } = setup();
    expect((await api.brokerFee()).own).toBe(false);
    const own = await api.setBrokerFee({ commission_rate: 0.001 });
    expect(own).toMatchObject({ own: true, commission_rate: 0.001 });
    expect(lastAudit(db)).toMatchObject({ action: "fee.changed", payload: { old_rate: null, new_rate: 0.001 } });
    await api.decideApproval(PENDING_PROPOSALS[0], { decision: "approve", approved_notional_try: null, comment: "" });
    const t = (await api.listTickets()).find((x) => x.proposal_id === PENDING_PROPOSALS[0]);
    if (!t) throw new Error("no ticket");
    const done = await api.markTicket(t.ticket_no, { mark: "entered", filled_qty: 10, avg_price: t.limit_price, filled_at: new Date(Date.parse(t.valid_until) - 1_000).toISOString() });
    expect(done.entry).toMatchObject({ commission_estimated: true, commission_rate: 0.001, commission_rate_own: true });
    expect(done.entry.commission_try).toBeCloseTo(10 * t.limit_price * 0.001, 2);
    expect((await api.setBrokerFee({ commission_rate: null })).own).toBe(false);
  });

  it("refuses a rate outside 0 to 1 %", async () => {
    const { api } = setup();
    expect(await errorOf(api.setBrokerFee({ commission_rate: 0.02 }))).toMatchObject({ status: 422 });
  });
});

describe("mock · start over", () => {
  it("needs the word, closes the book into history and returns to needs_setup", async () => {
    const { api, db } = setup();
    expect(await errorOf(api.startOver({ confirm: "evet" }))).toMatchObject({ status: 422, code: "confirm" });
    const out = await api.startOver({ confirm: "  BAŞTAN " });
    expect(out).toEqual({ closed_book: 1 });
    expect(lastAudit(db)).toMatchObject({ action: "book.reset", payload: { closed_book: 1 } });
    expect((await api.overview()).needs_setup).toBe(true);
    expect(await api.positions()).toEqual([]);
    const books = await api.previousBooks();
    expect(books).toHaveLength(1);
    expect(head(books).started_with).toBe(SEED_START_TRY);
    expect(head(head(books).movements).kind).toBe("start");
    // The new book is empty and takes a new start.
    const again = await api.moveMoney({ kind: "start", amount_try: 5_000 });
    expect([again.cash, again.put_in]).toEqual([5_000, 5_000]);
    expect(await errorOf(api.startOver({ confirm: "baştan" }).then(() => api.startOver({ confirm: "baştan" })))).toMatchObject({ code: "not_started" });
  });
});

describe("mock · export", () => {
  it("is a BOM, semicolons, decimal commas, every row with its status, and nothing runs as a formula", async () => {
    const { api } = setup(true);
    const start = head((await api.moveMoney({ kind: "start", amount_try: 1_250.5 })).movements);
    await api.moveMoney({ kind: "deposit", amount_try: 100, note: "=1+1" });
    await api.correctMovement(start.id, { amount_try: 2_000 });
    const { filename, blob } = await api.exportRecords();
    expect(filename).toMatch(/^kayitlarim-\d{4}-\d{2}-\d{2}\.csv$/);
    const bytes = await readBytes(blob);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    expect(text.startsWith("﻿Defter;Kayıt no;Tarih;Tür")).toBe(true);
    const lines = text.split("\r\n");
    expect(lines.some((l) => l.includes("Başlangıç parası") && l.includes("1250,50") && l.includes("Düzeltildi"))).toBe(true);
    expect(lines.some((l) => l.includes("'=1+1"))).toBe(true);
  });
});
