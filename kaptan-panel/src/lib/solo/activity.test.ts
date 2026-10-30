import type { ApprovalCard, Position } from "@/lib/domain";
import { NBSP } from "@/lib/format";
import { recentActivity } from "./activity";

const card = (over: Partial<ApprovalCard>): ApprovalCard =>
  ({
    proposal_id: "p1",
    ticker: "KRGCL",
    side: "buy",
    status: "pending",
    decided_at: null,
    final_notional_try: 50_000,
    approved_notional_try: null,
    ...over,
  }) as ApprovalCard;

const position = (over: Partial<Position>): Position =>
  ({ ticker: "FRZEN", qty: 100, avg_cost: 30, opened_at: "2027-01-05T07:00:00Z", source_proposal: "p-old", ...over }) as Position;

const texts = (items: ReturnType<typeof recentActivity>) => items.map((i) => i.text.replaceAll(NBSP, " "));

describe("Son işlemler", () => {
  it("writes fills, approvals, skips and holds in plain words, newest first", () => {
    const items = recentActivity(
      [
        card({ proposal_id: "a", status: "approved", decided_at: "2027-01-11T10:45:00Z" }),
        card({ proposal_id: "b", ticker: "KRGSG", side: "sell", status: "approved", decided_at: "2027-01-11T10:50:00Z", approved_notional_try: 40_000 }),
        card({ proposal_id: "c", ticker: "ORNCM", status: "rejected", decided_at: "2027-01-11T10:40:00Z" }),
        card({ proposal_id: "d", ticker: "TMSPZ" }),
      ],
      [position({})],
      [
        { id: "tut-MSLCM", symbol: "MSLCM", at: "2027-01-11T10:55:00Z", answer: "held" },
        { id: "tut-DMOKM", symbol: "DMOKM", at: "2027-01-11T10:30:00Z", answer: "skipped" },
      ],
    );
    expect(texts(items)).toEqual([
      "MSLCM elinde kalıyor",
      "KRGSG satışını onayladın · 40.000 ₺",
      "KRGCL alımını onayladın · 50.000 ₺",
      "ORNCM önerisini geçtin",
      "DMOKM önerisini geçtin",
      "3.000 ₺ FRZEN aldın",
    ]);
    expect(items.map((i) => i.kind)).toEqual(["held", "approved_sell", "approved_buy", "skipped", "skipped", "bought"]);
  });

  it("shows a filled approval once, as the buy", () => {
    const items = recentActivity([card({ proposal_id: "a", status: "approved", decided_at: "2027-01-11T10:45:00Z" })], [position({ source_proposal: "a", ticker: "KRGCL", qty: 10, avg_cost: 300 })]);
    expect(texts(items)).toEqual(["3.000 ₺ KRGCL aldın"]);
  });

  it("keeps only the last few and treats an old hold without an answer as a hold", () => {
    const holds = Array.from({ length: 9 }, (_, i) => ({ id: `h${i}`, symbol: `SYM${i}`, at: `2027-01-0${i + 1}T08:00:00Z` }));
    const items = recentActivity([], [], holds);
    expect(items).toHaveLength(6);
    expect(items[0]?.text).toBe("SYM8 elinde kalıyor");
  });
});
