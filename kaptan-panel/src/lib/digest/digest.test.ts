import { describe, expect, it } from "vitest";
import type { Digest, DigestItem } from "@/lib/domain/digest";
import { digestSentence, groupByKind, mineOf } from "./digest";

const item = (n: number, kind: DigestItem["kind"], why: DigestItem["why"] = null): DigestItem => ({
  disclosure_index: n,
  kind,
  ticker: "ABCDE",
  company_name: "Deneme A.Ş.",
  line: "Bir şey oldu.",
  headline: null,
  published_at: "2026-11-20T09:00:00.000Z",
  source_url: `https://www.kap.org.tr/tr/Bildirim/${n}`,
  why,
  outside_list: false,
  outside_note: null,
  tone: "belirsiz",
  so_what_tr: null,
  suggestion_tr: null,
  panel_path: `/bildirimler?bildirim=${n}`,
});

const digest = (total: number, over: Partial<Digest> = {}): Digest => ({
  day: "2026-11-20",
  is_trading_day: true,
  note: null,
  prev_day: "2026-11-19",
  next_day: null,
  total,
  truncated: false,
  kinds: [],
  items: [],
  ...over,
});

describe("digest words", () => {
  it("separates what is yours and groups the rest by kind in server order", () => {
    const items = [item(1, "earnings", "held"), item(2, "contract"), item(3, "earnings"), item(4, "buyback")];
    expect(mineOf(items).map((i) => i.disclosure_index)).toEqual([1]);
    const groups = groupByKind(items.filter((i) => i.why === null));
    expect(groups.map((g) => g.kind)).toEqual(["contract", "earnings", "buyback"]);
    expect(groups[1]?.items.map((i) => i.disclosure_index)).toEqual([3]);
  });

  it("says plainly when nothing stands out today and counts otherwise", () => {
    expect(digestSentence(null, "2026-11-20")).toBe("Duyuruları hazırlıyorum…");
    expect(digestSentence(digest(0), "2026-11-20")).toBe("Bugün dikkat çeken duyuru yok.");
    expect(digestSentence(digest(0), "2026-11-23")).toBe("Bu gün dikkat çeken duyuru yok.");
    expect(digestSentence(digest(7), "2026-11-20")).toBe("Bugün 7 önemli duyuru var.");
    expect(digestSentence(digest(7), "2026-11-23")).toBe("Bu gün 7 önemli duyuru vardı.");
  });
});
