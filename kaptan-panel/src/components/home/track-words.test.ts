import { describe, expect, it } from "vitest";
import type { TrackItem } from "@/lib/domain/reports";
import { barScale, isIfFollowed, recentTrack, trackSentence } from "./track-words";

const NOW = Date.parse("2027-01-11T12:00:00+03:00");
const item = (id: string, daysAgo: number, ratio: number | null, decision: TrackItem["decision"] = "took", status: TrackItem["status"] = "done"): TrackItem => ({
  proposal_id: id,
  ticker: id.toUpperCase(),
  company_name: "ÖRNEK A.Ş.",
  suggested_at: new Date(NOW - daysAgo * 86_400_000).toISOString(),
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

describe("KAPtan'ın önerdikleri", () => {
  it("counts only known results as wins over the last 30 days", () => {
    const items = [item("a", 2, 0.03), item("b", 5, -0.01), item("c", 10, 0.02, "skipped"), item("d", 3, null, "waiting", "open"), item("e", 60, 0.5)];
    expect(trackSentence(items, NOW)).toBe("Son 30 günde 4 öneri; sonucu belli olan 3 önerinin 2 tanesi kazandırdı.");
    expect(trackSentence([item("d", 3, null, "waiting", "open")], NOW)).toBe("Son 30 günde 1 öneri; sonuçları henüz belli değil.");
    expect(trackSentence([item("e", 60, 0.5)], NOW)).toBe("Son 30 günde öneri yok; daha önce 1 öneri vardı.");
    expect(trackSentence([], NOW)).toBe("Henüz öneri yok.");
  });

  it("shows the newest first on one shared scale, and labels the not-bought ones as 'if followed'", () => {
    const items = [item("old", 9, 0.01), item("new", 1, -0.04), item("mid", 4, 0.02)];
    expect(recentTrack(items, 2).map((i) => i.proposal_id)).toEqual(["new", "mid"]);
    expect(barScale(items)).toBeCloseTo(0.04);
    expect(isIfFollowed("skipped")).toBe(true);
    expect(isIfFollowed("took")).toBe(false);
  });
});
