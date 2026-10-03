import type { ApprovalCard, Order } from "@/lib/domain";
import {
  buildDecision,
  decideGate,
  draftErrors,
  effectiveStatus,
  executionStage,
  hasErrors,
  keptShare,
  leakFilter,
  lotsFor,
  multiplierLabel,
  parseTryAmount,
  shrinkPresets,
  sortQueue,
  traceTally,
  upsertCards,
  validateShrink,
} from "./approvals-logic";

const NOW = Date.parse("2027-01-11T10:40:00.000Z");

function card(over: Partial<ApprovalCard> & { proposal_id: string }): ApprovalCard {
  return {
    kind: "trade_approval",
    run_id: `run-${over.proposal_id}`,
    ticker: "ORNEK",
    company_name: "ÖRNEK ENERJİ A.Ş.",
    side: "buy",
    event_type: "E3",
    sub_type_tr: "Bağlayıcı hizmet sözleşmesi",
    headline_tr: "Yıllık gelirin %18'i tutarında bağlayıcı sözleşme",
    disclosure_index: 1651901,
    disclosure_url: "https://www.kap.org.tr/tr/Bildirim/1651901",
    final_notional_try: 60_016,
    requested_notional_try: 119_908,
    limit_price: 48.4,
    qty: 1240,
    entry: "intraday_limit",
    holding_days: [5, 5],
    level: "normal",
    escalation_reasons: [],
    evidence_summary: { n: 23, median_car_5d: 0.011, median_car_20d: 0.012, hit_rate_5d: 0.61, strength: "strong", card_id: "c" },
    skeptic_flags: [],
    skeptic_note_tr: "",
    size_multiplier: 0.5,
    compliance_summary_tr: "Tedbir yok",
    rule_trace_summary: [
      { rule: "E3.materiality", passed: true, observed: "%18", threshold: "≥ %10", detail_tr: "" },
      { rule: "LEAK.ret5d", passed: true, observed: "+%4,1", threshold: "< %8", detail_tr: "" },
      { rule: "EDGE.edge_cost", passed: false, observed: "1,5×", threshold: "≥ 2,0×", detail_tr: "" },
    ],
    degraded: false,
    prompt_manifest_hash: "a".repeat(64),
    created_at: "2027-01-11T10:41:48.000Z",
    expires_at: "2027-01-12T06:50:00.000Z",
    status: "pending",
    decided_by: null,
    decided_at: null,
    decision_comment: null,
    approved_notional_try: null,
    is_fixture: true,
    ...over,
  };
}

describe("status and queue", () => {
  it("treats a pending card past 09:50 as expired", () => {
    const c = card({ proposal_id: "p" });
    expect(effectiveStatus(c, NOW)).toBe("pending");
    expect(effectiveStatus(c, Date.parse(c.expires_at))).toBe("expired");
    expect(effectiveStatus(c, null)).toBe("pending");
    expect(effectiveStatus({ ...c, status: "approved" }, Date.parse(c.expires_at) + 1)).toBe("approved");
  });

  it("orders open cards by deadline, then decided cards newest first", () => {
    const a = card({ proposal_id: "a", expires_at: "2027-01-12T06:50:00.000Z" });
    const b = card({ proposal_id: "b", expires_at: "2027-01-11T12:00:00.000Z" });
    const d1 = card({ proposal_id: "d1", status: "approved", decided_at: "2027-01-11T06:12:00.000Z" });
    const d2 = card({ proposal_id: "d2", status: "rejected", decided_at: "2027-01-11T07:20:00.000Z" });
    expect(sortQueue([d1, a, d2, b], NOW).map((c) => c.proposal_id)).toEqual(["b", "a", "d2", "d1"]);
  });

  it("lets live cards replace fetched ones", () => {
    const base = [card({ proposal_id: "a" }), card({ proposal_id: "b" })];
    const live = [card({ proposal_id: "b", status: "approved" }), card({ proposal_id: "c" })];
    const out = upsertCards(base, live);
    expect(out.map((c) => `${c.proposal_id}:${c.status}`)).toEqual(["a:pending", "b:approved", "c:pending"]);
  });
});

describe("who may decide", () => {
  const open = { status: "pending" as const, killSwitchOn: false, haltedToday: false };
  it("lets only the Risk Officer act (segregation of duties)", () => {
    expect(decideGate({ ...open, role: "risk_officer" })).toMatchObject({ canDecide: true, canApprove: true, reason: null });
    for (const role of ["analyst", "admin", "auditor"] as const) {
      expect(decideGate({ ...open, role })).toMatchObject({ canDecide: false, tone: "role" });
    }
  });
  it("blocks every decision while the kill switch is on", () => {
    expect(decideGate({ ...open, role: "risk_officer", killSwitchOn: true })).toMatchObject({ canDecide: false, tone: "kill" });
  });
  it("allows only rejection during the daily halt", () => {
    expect(decideGate({ ...open, role: "risk_officer", haltedToday: true })).toMatchObject({ canDecide: true, canApprove: false, tone: "halt" });
  });
  it("closes decided and expired cards", () => {
    expect(decideGate({ ...open, role: "risk_officer", status: "expired" })).toMatchObject({ canDecide: false, tone: "closed" });
  });
});

describe("shrink (approve with a smaller amount)", () => {
  it("parses Turkish amounts", () => {
    expect(parseTryAmount("45.000")).toBe(45_000);
    expect(parseTryAmount("45000 TL")).toBe(45_000);
    expect(parseTryAmount("45.000,50")).toBe(45_000.5);
    expect(parseTryAmount("")).toBeNull();
    expect(parseTryAmount("abc")).toBeNull();
  });
  it("only accepts a smaller, positive, at-least-one-lot amount", () => {
    expect(validateShrink(30_000, 60_016, 48.4)).toBeNull();
    expect(validateShrink(null, 60_016, 48.4)).toMatch(/TL/);
    expect(validateShrink(0, 60_016, 48.4)).toMatch(/sıfırdan büyük/);
    expect(validateShrink(60_016, 60_016, 48.4)).toMatch(/büyütme yok/);
    expect(validateShrink(70_000, 60_016, 48.4)).toMatch(/büyütme yok/);
    expect(validateShrink(20, 60_016, 48.4)).toMatch(/bir lot/);
  });
  it("offers whole-lot presets and counts lots", () => {
    const p = shrinkPresets(60_016, 48.4);
    expect(p.map((x) => x.factor)).toEqual([0.75, 0.5, 0.25]);
    expect(p[1]).toEqual({ factor: 0.5, lots: 620, amount: 30_008 });
    expect(lotsFor(30_008, 48.4)).toBe(620);
    expect(lotsFor(-1, 48.4)).toBe(0);
    expect(shrinkPresets(10, 48.4)).toEqual([]);
  });
});

describe("decision payload", () => {
  const c = card({ proposal_id: "p" });
  it("requires a comment and a 6-digit code", () => {
    const e = draftErrors({ kind: "approve", comment: " ", totp: "12", amount: "" }, c);
    expect(e.comment).toBeTruthy();
    expect(e.totp).toBeTruthy();
    expect(e.amount).toBeNull();
    expect(hasErrors(e)).toBe(true);
    expect(hasErrors(draftErrors({ kind: "approve", comment: "Kanıt güçlü.", totp: "000000", amount: "" }, c))).toBe(false);
  });
  it("validates the amount only for shrink", () => {
    expect(draftErrors({ kind: "shrink", comment: "ok", totp: "000000", amount: "90.000" }, c).amount).toMatch(/büyütme/);
  });
  it("maps approve / shrink / reject to the 05 ApprovalDecision shape", () => {
    expect(buildDecision({ kind: "approve", comment: " Onay. ", totp: "000000", amount: "" })).toEqual({ decision: "approve", approved_notional_try: null, comment: "Onay.", totp: "000000" });
    expect(buildDecision({ kind: "shrink", comment: "Yarıya", totp: "000000", amount: "30.008" })).toMatchObject({ decision: "approve", approved_notional_try: 30_008 });
    expect(buildDecision({ kind: "reject", comment: "Hayır", totp: "000000", amount: "1" })).toMatchObject({ decision: "reject", approved_notional_try: null });
  });
});

describe("reading the card", () => {
  const c = card({ proposal_id: "p" });
  it("tallies the rule trace and finds the leak filter", () => {
    expect(traceTally(c.rule_trace_summary)).toEqual({ passed: 2, total: 3 });
    expect(leakFilter(c.rule_trace_summary)?.observed).toBe("+%4,1");
    expect(leakFilter([])).toBeNull();
  });
  it("labels the skeptic multiplier and the kept share", () => {
    expect(multiplierLabel(0.5)).toBe("×0,5");
    expect(multiplierLabel(1)).toBeNull();
    expect(keptShare(c)).toBeCloseTo(0.5, 2);
    expect(keptShare({ final_notional_try: 1, requested_notional_try: 0 })).toBeNull();
  });
});

describe("paper execution states", () => {
  const base: Order = {
    id: "ord",
    client_order_id: "k",
    proposal_id: "p",
    run_id: "r",
    ticker: "ORNEK",
    company_name: "ÖRNEK ENERJİ A.Ş.",
    side: "buy",
    order_type: "limit",
    tif: "opg",
    qty: 1240,
    limit_price: 48.4,
    status: "pending_open",
    broker: "simbist",
    created_at: "2027-01-11T10:45:00.000Z",
    fills: [],
    is_fixture: true,
  };
  const fill = (qty: number, price: number) => ({ id: `f${qty}`, order_id: "ord", qty, price, commission: 0, bsmv: 0, slippage_bps: 0, filled_at: "2027-01-11T10:46:00.000Z", source: "simbist" as const });

  it("describes every order status", () => {
    expect(executionStage(undefined).tone).toBe("idle");
    expect(executionStage(base)).toMatchObject({ label: "Açılışı bekliyor", tone: "waiting" });
    expect(executionStage({ ...base, status: "accepted", tif: "day" }).tone).toBe("waiting");
    expect(executionStage({ ...base, status: "awaiting_manual_entry" }).label).toMatch(/Manuel/);
    expect(executionStage({ ...base, status: "filled", fills: [fill(1240, 48.32)] })).toMatchObject({ label: "Doldu", tone: "done" });
    expect(executionStage({ ...base, status: "filled", fills: [fill(1240, 48.32)] }).detail).toContain("1.240 lot @ 48,32 TL");
    expect(executionStage({ ...base, status: "rejected" }).tone).toBe("failed");
  });
  it("names a partial fill and the limit-up open that never filled", () => {
    expect(executionStage({ ...base, status: "partially_filled", fills: [fill(400, 48.3)] })).toMatchObject({ label: "Kısmi dolum", tone: "partial" });
    expect(executionStage({ ...base, status: "partially_filled", fills: [fill(400, 48.3)] }).detail).toContain("400 / 1.240");
    expect(executionStage({ ...base, status: "canceled" })).toMatchObject({ label: "Tavanda açıldı, dolmadı", tone: "failed" });
    expect(executionStage({ ...base, status: "canceled", tif: "day" }).label).toBe("İptal edildi");
    expect(executionStage({ ...base, status: "canceled", tif: "day", fills: [fill(10, 48)] }).detail).toMatch(/10 lot/);
  });
});
