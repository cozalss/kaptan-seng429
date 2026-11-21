import { createMockApi } from "./mock-api";
import { MockDb } from "./db";
import * as sel from "./selectors";
import { isApiError } from "../types";

function setup() {
  const db = new MockDb(null, Date.now(), true);
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

/** A fresh book with 50.000 ₺ and 100 KRGCL held since a few days ago at 30 ₺. */
async function withKrgcl() {
  const s = setup();
  await s.api.moveMoney({ kind: "start", amount_try: 50_000 });
  await s.api.addHolding({ ticker: "KRGCL", qty: 100, avg_cost: 30, bought_on: "2027-01-04" });
  return s;
}

const lastAudit = (db: MockDb) => db.snapshot.auditAppends.at(-1);
const TODAY = "2027-01-11";

describe("a dividend", () => {
  it("is income: cash and the gain rise, the money put in does not", async () => {
    const { api, db } = await withKrgcl();
    const before = sel.bookOf(db.snapshot);
    const book = await api.recordDividend({ ticker: "KRGCL", net_try: 850, gross_try: 1000, received_on: TODAY });
    const after = sel.bookOf(db.snapshot);
    expect(after.cash).toBe(before.cash + 850);
    expect(after.equity).toBe(before.equity + 850);
    expect(after.put_in).toBe(before.put_in);
    expect(book.total_try).toBe(850);
    expect(book.per_holding[0]).toMatchObject({ ticker: "KRGCL", total_try: 850 });
    expect(lastAudit(db)?.action).toBe("dividend.recorded");
  });

  it("is undone by a new row, once", async () => {
    const { api, db } = await withKrgcl();
    const before = sel.bookOf(db.snapshot).cash;
    const first = await api.recordDividend({ ticker: "KRGCL", net_try: 850, received_on: TODAY });
    const id = first.records[0]?.id ?? "";
    const out = await api.undoCorporate(id);
    expect(sel.bookOf(db.snapshot).cash).toBe(before);
    expect(out.total_try).toBe(0);
    expect(out.records.map((r) => [r.corrects, r.undone])).toEqual([[id, false], [null, true]]);
    expect(lastAudit(db)?.action).toBe("dividend.corrected");
    expect(await errorOf(api.undoCorporate(id))).toEqual({ status: 409, code: "already_undone" });
    expect(await errorOf(api.undoCorporate(out.records[0]?.id ?? ""))).toEqual({ status: 409, code: "is_undo" });
  });

  it("says why it was refused", async () => {
    const { api } = await withKrgcl();
    expect(await errorOf(api.recordDividend({ ticker: "THYAO", net_try: 1, received_on: TODAY }))).toEqual({ status: 422, code: "never_held" });
    expect(await errorOf(api.recordDividend({ ticker: "KRGCL", net_try: 1, received_on: "2027-02-01" }))).toEqual({ status: 422, code: "future_date" });
    const fresh = setup();
    expect(await errorOf(fresh.api.recordDividend({ ticker: "KRGCL", net_try: 1, received_on: TODAY }))).toEqual({ status: 409, code: "not_started" });
  });
});

describe("a bonus issue", () => {
  it("doubles the shares, keeps the total cost and is no gain or loss", async () => {
    const { api, db } = await withKrgcl();
    const before = sel.bookOf(db.snapshot);
    const worthBefore = before.positions.reduce((s, p) => s + p.qty * p.last_price, 0);
    await api.recordBonus({ ticker: "KRGCL", ex_date: TODAY, bonus_pct: 100 });
    const after = sel.bookOf(db.snapshot);
    const pos = after.positions.find((p) => p.ticker === "KRGCL");
    expect(pos).toMatchObject({ qty: 200, avg_cost: 15 });
    expect(after.cash).toBe(before.cash);
    expect(after.equity).toBeCloseTo(before.equity, 0);
    expect(after.positions.reduce((s, p) => s + p.qty * p.last_price, 0)).toBeCloseTo(worthBefore, 0);
    expect(lastAudit(db)?.action).toBe("bonus.recorded");
  });

  it("takes the new count as typed, is undone, and refuses a count that is not more", async () => {
    const { api, db } = await withKrgcl();
    expect(await errorOf(api.recordBonus({ ticker: "KRGCL", ex_date: TODAY, new_qty: 100 }))).toEqual({ status: 422, code: "not_more" });
    const out = await api.recordBonus({ ticker: "KRGCL", ex_date: TODAY, new_qty: 250 });
    expect(out.records[0]).toMatchObject({ qty_added: 150, qty_after: 250 });
    await api.undoCorporate(out.records[0]?.id ?? "");
    expect(sel.positions(db.snapshot).find((p) => p.ticker === "KRGCL")).toMatchObject({ qty: 100, avg_cost: 30 });
  });

  it("refuses to be undone after shares were sold", async () => {
    const { api, db } = await withKrgcl();
    const out = await api.recordBonus({ ticker: "KRGCL", ex_date: TODAY, new_qty: 200 });
    const own = sel.positions(db.snapshot).find((p) => p.ticker === "KRGCL");
    await api.sellHolding(own?.id ?? "", { qty: 10, price: 17, sold_at: `${TODAY}T10:00:00.000Z`, commission_try: 1 });
    expect(await errorOf(api.undoCorporate(out.records[0]?.id ?? ""))).toEqual({ status: 409, code: "changed" });
  });

  it("needs a share the person holds", async () => {
    const { api } = await withKrgcl();
    expect(await errorOf(api.recordBonus({ ticker: "THYAO", ex_date: TODAY, new_qty: 2 }))).toEqual({ status: 409, code: "not_held" });
  });
});

describe("a rights issue", () => {
  it("pays cash and raises the average cost", async () => {
    const { api, db } = await withKrgcl();
    const before = sel.bookOf(db.snapshot);
    await api.recordRights({ ticker: "KRGCL", subscribed_on: TODAY, qty: 50, price: 10 });
    const after = sel.bookOf(db.snapshot);
    expect(after.cash).toBe(before.cash - 500);
    expect(after.put_in).toBe(before.put_in);
    expect(after.positions.find((p) => p.ticker === "KRGCL")).toMatchObject({ qty: 150 });
    expect(await errorOf(api.recordRights({ ticker: "KRGCL", subscribed_on: TODAY, qty: 1, price: 1e9 }))).toEqual({ status: 422, code: "over_cash" });
  });
});

describe("KAP notices", () => {
  it("ask only while the share is held, change nothing, and close when answered", async () => {
    const fresh = setup();
    expect((await fresh.api.corporateNotices()).notices).toEqual([]);
    const { api, db } = await withKrgcl();
    const cash = sel.bookOf(db.snapshot).cash;
    const got = (await api.corporateNotices()).notices;
    expect(got.map((n) => n.kind)).toEqual(["dividend", "bonus"]);
    expect(got[0]).toMatchObject({ per_share_gross_try: 1.25, held_qty: 100, expected_gross_try: 125, facts_note: "" });
    expect(got[0]?.headline).toContain("hisse başı 1,25 ₺ brüt, ödeme 20 Ocak");
    expect(got[1]?.facts_note).toContain("okuyamadım");
    expect(sel.bookOf(db.snapshot).cash).toBe(cash);
    expect((await api.dismissNotice(got[0]?.id ?? "")).notices.map((n) => n.kind)).toEqual(["bonus"]);
    await api.recordBonus({ ticker: "KRGCL", ex_date: TODAY, new_qty: 200, notice_id: got[1]?.id });
    expect((await api.corporateNotices()).notices).toEqual([]);
    expect(await errorOf(api.dismissNotice("bildirim-1"))).toEqual({ status: 404, code: "not_found" });
  });
});
