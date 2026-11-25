import { describe, expect, it } from "vitest";
import type { DigestItem } from "@/lib/domain/digest";
import { funnelSteps, kindBars, outsideSummary, takeaways } from "./learned-words";

const item = (kind: DigestItem["kind"], tone: DigestItem["tone"], outside = false): DigestItem => ({
  disclosure_index: Math.floor(Math.random() * 1e6) + 1,
  kind,
  ticker: "ORNEK",
  company_name: "ÖRNEK A.Ş.",
  line: "Bir şey oldu.",
  headline: null,
  published_at: "2027-01-11T09:00:00+03:00",
  source_url: "https://www.kap.org.tr/tr/Bildirim/1",
  why: null,
  outside_list: outside,
  outside_note: outside ? "KAPtan bu hisseye öneri vermez" : null,
  tone,
  so_what_tr: null,
  suggestion_tr: null,
  panel_path: "/bildirimler?bildirim=1",
});

describe("KAPtan bugün ne öğrendi", () => {
  it("walks the funnel with a plain reason at the narrow end, never a circular one", () => {
    const steps = funnelSteps({ read: 373, relevant: 7, proposals: 0, reasons: [{ reason_tr: "duyuru KAPtan'ın öneri verdiği olay türlerinden değildi", n: 3 }] });
    expect(steps.map((s) => s.n)).toEqual([373, 7, 0]);
    expect(steps[2]?.why).toBe("En sık neden: duyuru KAPtan'ın öneri verdiği olay türlerinden değildi (3).");
    expect(steps.map((s) => s.why).join(" ")).not.toMatch(/kurallar geçmedi/);
    expect(funnelSteps({ read: 0, relevant: 0, proposals: 0, reasons: [] })[0]?.why).toBe("KAP'tan bugün henüz duyuru gelmedi.");
  });

  it("counts kinds biggest first with their tones", () => {
    const bars = kindBars([item("buyback", "olumlu"), item("buyback", "olumlu"), item("insider", "olumsuz")]);
    expect(bars.map((b) => [b.kind, b.total])).toEqual([["buyback", 2], ["insider", 1]]);
    expect(bars[0]?.tones.olumlu).toBe(2);
  });

  it("says two or three deterministic takeaways", () => {
    const items = [item("buyback", "olumlu", true), item("buyback", "olumlu", true), item("insider", "olumsuz")];
    expect(takeaways({ items }, 0)).toEqual(["Bugün en çok pay geri alımı vardı (2).", "Senin hisselerinde önemli bir şey olmadı.", "Öne çıkanların 2 tanesi KAPtan'ın öneri vermediği hisselerden."]);
    expect(takeaways({ items: [item("dividend", "olumlu")] }, 2)).toEqual(["Bugün en çok kâr payı duyurusu vardı (1).", "Senin hisselerinde 2 önemli duyuru var.", "1 olumlu, 0 olumsuz duyuru vardı."]);
    expect(takeaways(null, null)).toEqual([]);
  });

  it("sums the outside-list note once instead of on every row", () => {
    expect(outsideSummary([{ outside_list: true }, { outside_list: true }, { outside_list: false }])).toMatch(/^Bunların çoğu/);
    expect(outsideSummary([{ outside_list: false }])).toBeNull();
  });
});
