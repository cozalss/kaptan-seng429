import { describe, expect, it } from "vitest";
import type { TrackItem } from "@/lib/domain/reports";
import type { ApprovalCard } from "@/lib/domain/trading";
import { emptyReason, filterRows, isIfFollowed, isSuggestedFilter, ratioScale, suggestedRows, whyLine } from "./suggested-words";

const card = (id: string, at: string, status: ApprovalCard["status"], side: ApprovalCard["side"] = "buy", n = 12): ApprovalCard =>
  ({
    proposal_id: id,
    ticker: id.toUpperCase(),
    company_name: "ÖRNEK ENERJİ A.Ş.",
    side,
    sub_type_tr: "Yeni iş ilişkisi",
    headline_tr: "Örnek Enerji 120 milyon liralık bir ihale kazandı.",
    evidence_summary: { n, median_car_5d: 0.021, median_car_20d: 0, hit_rate_5d: 0.6, strength: "moderate", card_id: "c" },
    created_at: at,
    status,
  }) as unknown as ApprovalCard;

const track = (id: string, ratio: number | null, decision: TrackItem["decision"], status: TrackItem["status"] = "done"): TrackItem => ({
  proposal_id: id,
  ticker: id.toUpperCase(),
  company_name: "",
  suggested_at: "2027-01-01T10:00:00Z",
  decision,
  decision_tr: "",
  entry_day: "2027-01-01",
  result_day: null,
  planned_sessions: 5,
  status,
  return_ratio: ratio,
  index_ratio: null,
  result_tr: "",
});

describe("Öneriye düşenler", () => {
  const cards = [
    card("a", "2027-01-02T09:00:00Z", "approved"),
    card("b", "2027-01-05T09:00:00Z", "pending"),
    card("c", "2027-01-03T09:00:00Z", "rejected"),
    card("d", "2027-01-04T09:00:00Z", "expired", "sell"),
  ];
  const rows = suggestedRows(cards, [track("a", 0.04, "took"), track("c", -0.02, "skipped"), track("d", null, "expired", "open")]);

  it("puts the newest first and says each status plainly", () => {
    expect(rows.map((r) => r.id)).toEqual(["b", "d", "c", "a"]);
    expect(rows.map((r) => r.state)).toEqual(["bekliyor", "doldu", "gectin", "onayladin"]);
  });

  it("joins the result and marks the ones not bought as 'if you had followed it'", () => {
    const by = new Map(rows.map((r) => [r.id, r]));
    expect(by.get("a")).toMatchObject({ ratio: 0.04, ifFollowed: false, pending: null, verb: "al" });
    expect(by.get("c")).toMatchObject({ ratio: -0.02, ifFollowed: true });
    expect(by.get("b")?.pending).toBe("Kararını bekliyor");
    expect(by.get("d")).toMatchObject({ verb: "sat", pending: "Sonuç henüz belli değil" });
    expect(ratioScale(rows)).toBe(0.04);
    expect(isIfFollowed("approved_open")).toBe(false);
  });

  it("filters by status, and only known filters pass", () => {
    expect(filterRows(rows, "gectin").map((r) => r.id)).toEqual(["c"]);
    expect(filterRows(rows, "hepsi")).toHaveLength(4);
    expect(isSuggestedFilter("doldu")).toBe(true);
    expect(isSuggestedFilter("x")).toBe(false);
    expect(isSuggestedFilter(null)).toBe(false);
  });

  it("says why in one line: past cases for a buy, the kind for a sell or with none", () => {
    expect(whyLine(card("a", "", "pending"))).toBe("Benzer 12 olayda ortadaki hisse 5 günde piyasadan %2,1 iyi gitti.");
    expect(whyLine(card("a", "", "pending", "sell"))).toBe("Yeni iş ilişkisi");
    expect(whyLine(card("a", "", "pending", "buy", 0))).toBe("Yeni iş ilişkisi");
  });

  it("explains an empty list from the day's reading, never with a circular reason", () => {
    expect(emptyReason(null)).toMatch(/^Henüz hiçbir duyuru öneriye dönüşmedi\. KAPtan yalnız/);
    expect(emptyReason({ read: 0, relevant: 0, reasons: [] })).toBe("Henüz hiçbir duyuru öneriye dönüşmedi. KAP'tan bugün henüz duyuru gelmedi.");
    expect(emptyReason({ read: 373, relevant: 0, reasons: [] })).toContain("hiçbiri KAPtan'ın öneri verebileceği türden");
    expect(emptyReason({ read: 373, relevant: 7, reasons: [{ reason_tr: "fiyat çoktan hareket etmişti", n: 4 }] })).toBe(
      "Henüz hiçbir duyuru öneriye dönüşmedi. Bugün 373 duyuru okundu, 7 tanesine yakından bakıldı. En sık neden: fiyat çoktan hareket etmişti.",
    );
  });
});
