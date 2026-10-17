import type { OrderTicket } from "@/lib/domain";
import { DEMO_ORDER_TICKET } from "@/mocks/governance";
import { istanbulIso } from "@/lib/time";
import {
  accountShare,
  buildMarkInput,
  defaultFillClock,
  fillIso,
  hasMarkErrors,
  initialDraft,
  isMarkable,
  markErrors,
  parseClock,
  parsePrice,
  parseQty,
  slipsToEnter,
  ticketCopyText,
  ticketPhase,
  validFrom,
  type MarkDraft,
} from "./ticket-logic";

const T = DEMO_ORDER_TICKET; // 620 lot @ 48,40, valid 13:46:20 → 14:16:20 on 11.01.2027
const at = (hhmm: string, s = 0) => Date.parse(istanbulIso("2027-01-11", hhmm, s));
const withEntry = (t: OrderTicket, status: OrderTicket["entry"]["status"], no = t.ticket_no, created = t.created_at): OrderTicket => ({
  ...t,
  ticket_no: no,
  created_at: created,
  entry: { ...t.entry, status },
});
const draft = (over: Partial<MarkDraft> = {}): MarkDraft => ({ kind: "entered", qty: "620", price: "48,32", time: "13:52", note: "", ...over });

describe("validity window (12 §2, R16)", () => {
  it("starts at creation and lasts 30 minutes", () => {
    expect(validFrom(T)).toBe(T.created_at);
    expect(ticketPhase(T, at("13:40"))).toBe("upcoming");
    expect(ticketPhase(T, at("14:00"))).toBe("valid");
    expect(ticketPhase(T, at("14:16", 20))).toBe("expired");
  });

  it("a pre-open ticket counts its 30 minutes from 09:40", () => {
    const pre = { created_at: istanbulIso("2027-01-12", "08:52", 10), valid_until: istanbulIso("2027-01-12", "10:10") };
    expect(validFrom(pre)).toBe(istanbulIso("2027-01-12", "09:40"));
  });

  it("only awaiting or expired tickets can be marked", () => {
    expect(isMarkable(T)).toBe(true);
    expect(isMarkable(withEntry(T, "expired"))).toBe(true);
    expect(isMarkable(withEntry(T, "entered"))).toBe(false);
  });

  it("slips to enter are markable and inside their window, and none before the clock is known", () => {
    const tickets = [T, withEntry(T, "entered", "F-2")];
    expect(slipsToEnter(tickets, at("14:00")).map((t) => t.ticket_no)).toEqual([T.ticket_no]);
    expect(slipsToEnter(tickets, at("14:16", 20))).toEqual([]);
    expect(slipsToEnter(tickets, null)).toEqual([]);
    expect(slipsToEnter(undefined, at("14:00"))).toEqual([]);
  });
});

describe("reading the slip", () => {
  it("computes the account share", () => {
    expect(accountShare(T)).toBeCloseTo(30_008 / 350_000, 6);
    expect(accountShare({ est_notional_try: 1, account_equity_try: 0 })).toBe(0);
  });

  it("copies the fields you type into the broker app, nothing else", () => {
    const text = ticketCopyText(T);
    expect(text).toContain("AL ORNEK · LİMİT 48,40 TL · 620 lot");
    expect(text).not.toContain("\u00a0");
    expect(text).toContain("T-2027-0111-003");
    expect(text).toContain("13:46–14:16");
    expect(text).not.toContain(T.audit_hash);
  });
});

describe("the mark form", () => {
  it("parses Turkish numbers and clocks", () => {
    expect(parseQty("1.240")).toBe(1240);
    expect(parseQty("12a")).toBeNull();
    expect(parsePrice("48,32")).toBe(48.32);
    expect(parsePrice("1.048,5 TL")).toBe(1048.5);
    expect(parsePrice("48.32")).toBe(48.32);
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("x")).toBeNull();
    expect(parseClock("13:52")).toBe(832);
    expect(parseClock("9.05")).toBe(545);
    expect(parseClock("25:00")).toBeNull();
    expect(parseClock("1352")).toBeNull();
  });

  it("puts the fill on the ticket's own Istanbul day", () => {
    expect(fillIso(T, 13 * 60 + 52)).toBe(istanbulIso("2027-01-11", "13:52"));
  });

  it("defaults the clock to now, inside the window", () => {
    expect(defaultFillClock(T, at("13:55"))).toBe("13:55");
    expect(defaultFillClock(T, at("13:40"))).toBe("13:46");
    expect(defaultFillClock(T, at("15:00"))).toBe("14:15");
    expect(initialDraft("entered", T, at("13:55"))).toEqual({ kind: "entered", qty: "620", price: "48,40", time: "13:55", note: "" });
  });

  it("applies the API's own rules: qty ≤ ticket, price ≤ limit, time ≤ valid-until", () => {
    expect(hasMarkErrors(markErrors(draft(), T))).toBe(false);
    expect(markErrors(draft({ qty: "621" }), T).qty).toMatch(/620 lot/);
    expect(markErrors(draft({ qty: "0" }), T).qty).toMatch(/tam sayı/);
    expect(markErrors(draft({ price: "48,41" }), T).price).toMatch(/aşamaz/);
    expect(markErrors(draft({ price: "" }), T).price).toMatch(/fiyatı yaz/);
    expect(markErrors(draft({ time: "14:17" }), T).time).toMatch(/R16/);
    expect(markErrors(draft({ time: "nope" }), T).time).toMatch(/SS:DD/);
    expect(markErrors(draft({ note: "x".repeat(501) }), T).note).toMatch(/500/);
  });

  it("only checks the note for dolmadı / iptal", () => {
    expect(hasMarkErrors(markErrors(draft({ kind: "unfilled", qty: "", price: "", time: "" }), T))).toBe(false);
  });

  it("builds the exact POST /tickets/{no}/mark payload", () => {
    expect(buildMarkInput(draft({ note: "  Açılışta doldu  " }), T)).toEqual({
      mark: "entered",
      filled_qty: 620,
      avg_price: 48.32,
      filled_at: istanbulIso("2027-01-11", "13:52"),
      note: "Açılışta doldu",
    });
    expect(buildMarkInput(draft({ kind: "canceled" }), T)).toEqual({ mark: "canceled", note: undefined });
    expect(buildMarkInput(draft({ qty: "x", price: "y", time: "z" }), T)).toMatchObject({ filled_qty: 0, avg_price: 0 });
  });
});
