import type { ApprovalCard } from "@/lib/domain";
import { decideGate, effectiveStatus, sortQueue } from "./approvals-logic";

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
    decided_role: null,
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
});

describe("when you may decide", () => {
  const open = { status: "pending" as const, killSwitchOn: false, haltedToday: false };
  it("lets you approve or reject an open proposal", () => {
    expect(decideGate(open)).toMatchObject({ canDecide: true, canApprove: true, reason: null, tone: null });
    expect(decideGate({ ...open, status: "claimed" })).toMatchObject({ canDecide: true });
  });
  it("blocks every decision while the kill switch is on", () => {
    expect(decideGate({ ...open, killSwitchOn: true })).toMatchObject({ canDecide: false, tone: "kill" });
  });
  it("allows only rejection during the daily halt", () => {
    expect(decideGate({ ...open, haltedToday: true })).toMatchObject({ canDecide: true, canApprove: false, tone: "halt" });
  });
  it("closes decided and expired cards", () => {
    expect(decideGate({ ...open, status: "expired" })).toMatchObject({ canDecide: false, tone: "closed" });
  });
});
