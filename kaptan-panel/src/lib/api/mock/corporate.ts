import { BonusInput, DividendInput, RightsInput, type CorporateBook, type CorporateNotice, type CorporateRecord } from "@/lib/domain/corporate";
import { noticeHeadline } from "@/lib/corporate-words";
import { ApiError, type KaptanApi } from "../types";
import { parse, userActor, type MockCtx } from "./guard";
import { isUndone, liveRows, type CorporateRow } from "./corporate-ledger";
import { hasStarted, ownHeld } from "./ledger";
import type { MockState } from "./state";
import * as sel from "./selectors";

/**
 * Company actions in the test double: same answers, error codes and audit actions as the backend
 * (`portfolio/corporate.py`). A bonus or rights issue is open for hand-entered holdings only here;
 * a dividend is open for any share the person holds or held. The KAP notices are a fixed pair
 * about KRGCL (one with the numbers read, one without), shown only while the person holds it.
 */
type Corporate = Pick<KaptanApi, "corporateBook" | "recordDividend" | "recordBonus" | "recordRights" | "undoCorporate" | "corporateNotices" | "dismissNotice">;

const MSG_NOT_STARTED = "Önce başlangıç paranı gir.";
const MSG_NOT_HELD = "Bu hisse şu an elinde görünmüyor.";
const MSG_NEVER_HELD = "Bu hisse defterinde hiç yok.";
const MSG_FUTURE = "Gelecekteki bir tarihi giremezsin.";
const MSG_NOT_MORE = "Yeni adet, şimdiki adetten büyük olmalı.";
const MSG_OVER_CASH = "Elindeki nakitten fazlasını ödeyemezsin.";
const MSG_NOT_OWN = "Bunu KAPtan önermişti; bedelsiz ve bedelli payları bu sürümde yalnızca kendi eklediğin hisseler için yazabilirsin.";
const MSG_CHANGED = "Bu kayıttan sonra bu hisseyi aldığın ya da sattığın için geri alamıyorum. Önce son hareketi düzelt.";
const KAP_URL = "https://www.kap.org.tr/tr/Bildirim/";
const PUBLISHED = "2027-01-11T08:10:00.000Z";

const cents = (n: number) => Math.round(n * 100) / 100;
const istDay = (iso: string) => new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(0, 10);

const NOTICES: ReadonlyArray<Omit<CorporateNotice, "headline" | "held_qty" | "expected_gross_try">> = [
  { id: "bildirim-9000001", ticker: "KRGCL", kind: "dividend", published_at: PUBLISHED, per_share_gross_try: 1.25, per_share_net_try: 1.0625, pay_date: "2027-01-20", ex_date: "2027-01-18", bonus_pct: null, facts_note: "", url: `${KAP_URL}9000001` },
  { id: "bildirim-9000002", ticker: "KRGCL", kind: "bonus", published_at: PUBLISHED, per_share_gross_try: null, per_share_net_try: null, pay_date: null, ex_date: null, bonus_pct: null, facts_note: "Rakamları bildirimden güvenle okuyamadım; hesabına geçen gerçek rakamı sen yaz.", url: `${KAP_URL}9000002` },
];

function view(state: MockState, nowIso: string): CorporateBook {
  const rows = state.book.corporate ?? [];
  const year = istDay(nowIso).slice(0, 4);
  const totals = new Map<string, { company: string; year: number; all: number }>();
  for (const r of liveRows(rows).filter((x) => x.kind === "dividend")) {
    const t = totals.get(r.ticker) ?? { company: sel.companyOf(r.ticker)?.name ?? r.ticker, year: 0, all: 0 };
    totals.set(r.ticker, { ...t, all: cents(t.all + (r.net_try ?? 0)), year: istDay(r.occurred_at).startsWith(year) ? cents(t.year + (r.net_try ?? 0)) : t.year });
  }
  const per = [...totals].map(([ticker, t]) => ({ ticker, company: t.company, this_year_try: t.year, total_try: t.all })).sort((a, b) => b.total_try - a.total_try);
  const records = [...rows].reverse().map((r): CorporateRecord => ({
    id: r.id,
    kind: r.kind,
    ticker: r.ticker,
    company: sel.companyOf(r.ticker)?.name ?? r.ticker,
    occurred_at: r.occurred_at,
    recorded_at: r.recorded_at,
    net_try: r.net_try,
    gross_try: r.gross_try,
    qty_added: r.qty_added,
    qty_after: r.qty_added === null || r.qty_before === null ? null : r.qty_before + r.qty_added,
    price: r.price,
    note: r.note,
    corrects: r.corrects,
    undone: isUndone(rows, r.id),
  }));
  return { this_year_try: cents(per.reduce((s, p) => s + p.this_year_try, 0)), total_try: cents(per.reduce((s, p) => s + p.total_try, 0)), per_holding: per, records };
}

function heldQty(state: MockState, ticker: string): number {
  return sel.positions(state).filter((p) => p.ticker === ticker).reduce((s, p) => s + p.qty, 0);
}

function openNotices(state: MockState): CorporateNotice[] {
  const rows = liveRows(state.book.corporate);
  return NOTICES.flatMap((n): CorporateNotice[] => {
    const held = heldQty(state, n.ticker);
    const recorded = rows.some((r) => r.ticker === n.ticker && r.kind === n.kind && Date.parse(r.recorded_at) >= Date.parse(n.published_at));
    if (held <= 0 || state.book.notices?.[n.id] || recorded) return [];
    const gross = n.per_share_gross_try;
    return [{ ...n, headline: noticeHeadline(n.ticker, n), held_qty: held, expected_gross_try: gross === null ? null : cents(gross * held) }];
  });
}

export function createCorporate(ctx: MockCtx): Corporate {
  const { db, ok, now } = ctx;
  const started = () => {
    if (!hasStarted(db.snapshot.book)) throw new ApiError(409, "not_started", MSG_NOT_STARTED);
  };
  const noFuture = (day: string) => {
    if (day > istDay(now())) throw new ApiError(422, "future_date", MSG_FUTURE);
  };
  const nextId = () => `kurum-${(db.snapshot.book.corporate ?? []).length + 1}`;
  const push = (row: CorporateRow, notice: string | null | undefined) =>
    db.update((s) => ({ ...s, book: { ...s.book, corporate: [...(s.book.corporate ?? []), row], notices: notice ? { ...s.book.notices, [notice]: "recorded" } : s.book.notices } }));
  const base = (kind: CorporateRow["kind"], ticker: string, at: string, note: string, notice: string | null | undefined): CorporateRow => ({
    id: nextId(), kind, ticker, holding_id: null, occurred_at: at, recorded_at: now(), net_try: null, gross_try: null, qty_added: null, qty_before: null, price: null, note, corrects: null, notice_id: notice ?? null,
  });
  /** The hand-entered holding a bonus or a rights issue changes. */
  const ownHolding = (ticker: string) => {
    const book = db.snapshot.book;
    const h = book.holdings.find((x) => x.ticker === ticker && ownHeld(book, x.id) > 0);
    if (h) return h;
    throw new ApiError(409, heldQty(db.snapshot, ticker) > 0 ? "not_own" : "not_held", heldQty(db.snapshot, ticker) > 0 ? MSG_NOT_OWN : MSG_NOT_HELD);
  };

  return {
    async corporateBook() {
      ctx.me();
      return ok(view(db.snapshot, now()), 80);
    },

    async recordDividend(input) {
      const a = ctx.me();
      const d = parse(DividendInput, input);
      started();
      noFuture(d.received_on);
      const everHeld = heldQty(db.snapshot, d.ticker) > 0 || db.snapshot.book.holdings.some((h) => h.ticker === d.ticker);
      if (!everHeld) throw new ApiError(422, "never_held", MSG_NEVER_HELD);
      const at = Date.parse(`${d.received_on}T09:00:00.000Z`) > Date.parse(now()) ? now() : `${d.received_on}T09:00:00.000Z`;
      const row = { ...base("dividend", d.ticker, at, d.note, d.notice_id), net_try: cents(d.net_try), gross_try: d.gross_try == null ? null : cents(d.gross_try) };
      push(row, d.notice_id);
      db.audit(userActor(a), "dividend.recorded", "book", row.id, { ticker: d.ticker, company: sel.companyOf(d.ticker)?.name ?? d.ticker, net_try: row.net_try, received_on: d.received_on });
      return ok(view(db.snapshot, now()));
    },

    async recordBonus(input) {
      const a = ctx.me();
      const b = parse(BonusInput, input);
      started();
      noFuture(b.ex_date);
      const holding = ownHolding(b.ticker);
      const before = ownHeld(db.snapshot.book, holding.id);
      const total = b.new_qty ?? Math.floor(before * (1 + (b.bonus_pct ?? 0) / 100));
      if (total <= before) throw new ApiError(422, "not_more", MSG_NOT_MORE);
      const row = { ...base("bonus", b.ticker, `${b.ex_date}T07:15:00.000Z`, b.note, b.notice_id), holding_id: holding.id, qty_before: before, qty_added: total - before };
      push(row, b.notice_id);
      db.audit(userActor(a), "bonus.recorded", "book", row.id, { ticker: b.ticker, company: holding.company_name, qty_before: before, qty_after: total, ex_date: b.ex_date });
      return ok(view(db.snapshot, now()));
    },

    async recordRights(input) {
      const a = ctx.me();
      const r = parse(RightsInput, input);
      started();
      noFuture(r.subscribed_on);
      const holding = ownHolding(r.ticker);
      const paid = cents(r.qty * r.price);
      if (paid > sel.bookOf(db.snapshot).cash) throw new ApiError(422, "over_cash", MSG_OVER_CASH);
      const before = ownHeld(db.snapshot.book, holding.id);
      const row = { ...base("rights", r.ticker, `${r.subscribed_on}T09:00:00.000Z`, r.note, r.notice_id), holding_id: holding.id, net_try: paid, qty_before: before, qty_added: r.qty, price: r.price };
      push(row, r.notice_id);
      db.audit(userActor(a), "rights.recorded", "book", row.id, { ticker: r.ticker, company: holding.company_name, qty: r.qty, price: r.price, paid_try: paid });
      return ok(view(db.snapshot, now()));
    },

    async undoCorporate(recordId) {
      const a = ctx.me();
      const rows = db.snapshot.book.corporate ?? [];
      const rec = rows.find((r) => r.id === recordId);
      if (!rec) throw new ApiError(404, "not_found", "Kayıt bulunamadı.");
      if (rec.corrects !== null) throw new ApiError(409, "is_undo", "Bu bir düzeltme kaydı; geri alınmaz.");
      if (isUndone(rows, rec.id)) throw new ApiError(409, "already_undone", "Bu kaydı zaten geri aldın.");
      if (rec.holding_id !== null && ownHeld(db.snapshot.book, rec.holding_id) !== (rec.qty_before ?? 0) + (rec.qty_added ?? 0)) throw new ApiError(409, "changed", MSG_CHANGED);
      const fix: CorporateRow = { ...rec, id: nextId(), recorded_at: now(), corrects: rec.id, notice_id: null };
      push(fix, null);
      db.audit(userActor(a), `${rec.kind}.corrected`, "book", fix.id, { ticker: rec.ticker, company: sel.companyOf(rec.ticker)?.name ?? rec.ticker, corrects: rec.id });
      return ok(view(db.snapshot, now()));
    },

    async corporateNotices() {
      ctx.me();
      return ok({ notices: openNotices(db.snapshot) }, 80);
    },

    async dismissNotice(noticeId) {
      const a = ctx.me();
      if (!NOTICES.some((n) => n.id === noticeId)) throw new ApiError(404, "not_found", "Bu bildirimi tanımıyorum.");
      db.update((s) => ({ ...s, book: { ...s.book, notices: { ...s.book.notices, [noticeId]: "dismissed" } } }));
      db.audit(userActor(a), "corporate.dismissed", "book", noticeId, {});
      return ok({ notices: openNotices(db.snapshot) });
    },
  };
}
