import { describe, expect, it } from "vitest";
import { filtersToQuery, isNarrowed, NO_FILTERS, parseFilters, toQuery } from "@/components/disclosures/filters";
import { disclosureTarget, opensSearch, rowsOf } from "@/components/search/search-logic";
import { ageWords, isFresh } from "@/components/watchlist/watch-logic";
import { closeAgeSentence, followingSentence, lineSummary, priceHeadline } from "@/components/company/company-words";
import { MockDb } from "@/lib/api/mock/db";
import { createMockApi } from "@/lib/api/mock/mock-api";
import { MOCK_USER } from "@/lib/auth/mock-user";
import { foldTr, rankCompany } from "./fold";
import { periodFromParam } from "./company";

describe("Turkish folding", () => {
  it("lets İ, i, I and ı meet and drops accents", () => {
    expect(foldTr("İŞBANK")).toBe("isbank");
    expect(foldTr("Işık Hâlâ")).toBe("isik hala");
    expect(foldTr("  Türk   Hava, Yolları ")).toBe("turk hava yollari");
  });
  it("ranks the ticker first, then name starts, then word starts, then anywhere", () => {
    expect(rankCompany("thyao", "THYAO", "Türk Hava Yolları")).toBe(0);
    expect(rankCompany("thy", "THYAO", "Türk Hava Yolları")).toBe(1);
    expect(rankCompany("turk hava", "THYAO", "Türk Hava Yolları")).toBe(2);
    expect(rankCompany("yolları", "THYAO", "Türk Hava Yolları")).toBe(3);
    expect(rankCompany("ava yol", "THYAO", "Türk Hava Yolları")).toBe(4);
    expect(rankCompany("zzz", "THYAO", "Türk Hava Yolları")).toBeNull();
    expect(rankCompany("  ", "THYAO", "Türk Hava Yolları")).toBeNull();
  });
});

describe("Okunanlar filters in the address", () => {
  it("round-trips a state and drops anything odd", () => {
    const f = { ...NO_FILTERS, day: "2026-11-20", company: "THYAO", type: "E3" as const, acted: true, whose: "izlediklerim" as const, open: 42 };
    expect(parseFilters(new URLSearchParams(filtersToQuery(f)))).toEqual(f);
    expect(filtersToQuery(NO_FILTERS)).toBe("");
    const odd = parseFilters(new URLSearchParams("gun=yarin&sirket=a&tur=E9&kimler=herkes&bildirim=-3&islem=0"));
    expect(odd).toEqual(NO_FILTERS);
  });
  it("uppercases the company the Turkish way and tells the API what is narrowed", () => {
    expect(parseFilters(new URLSearchParams("sirket=thyao")).company).toBe("THYAO");
    expect(isNarrowed({ ...NO_FILTERS, day: "2026-11-20", open: 5 })).toBe(false);
    expect(toQuery({ ...NO_FILTERS, whose: "benim", acted: true })).toEqual({ ticker: undefined, type: undefined, acted: true, scope: "mine" });
  });
});

describe("search box logic", () => {
  it("opens with / outside a field and Ctrl+K anywhere", () => {
    expect(opensSearch({ key: "/", ctrlKey: false, metaKey: false, target: { tagName: "BODY" } })).toBe(true);
    expect(opensSearch({ key: "/", ctrlKey: false, metaKey: false, target: { tagName: "INPUT" } })).toBe(false);
    expect(opensSearch({ key: "k", ctrlKey: true, metaKey: false, target: { tagName: "INPUT" } })).toBe(true);
    expect(opensSearch({ key: "a", ctrlKey: false, metaKey: false, target: null })).toBe(false);
  });
  it("puts companies before disclosures and sends a disclosure to its day with the reading open", () => {
    const rows = rowsOf({
      q: "x",
      companies: [{ ticker: "THYAO", name: "Türk Hava Yolları", sector: "Ulaştırma" }],
      disclosures: [{ disclosure_index: 7, ticker: "THYAO", company_name: "THY", subject: "Yeni iş", published_at: "2026-11-20T22:30:00.000Z" }],
    });
    expect(rows.map((r) => r.kind)).toEqual(["company", "disclosure"]);
    expect(rows[0]?.to).toBe("/hisse/THYAO");
    expect(rows[1]?.to).toBe("/bildirimler?gun=2026-11-21&bildirim=7"); // 01:30 Istanbul belongs to the 21st
    expect(disclosureTarget(1, "2026-11-20T10:00:00.000Z")).toContain("gun=2026-11-20");
  });
});

describe("watchlist words", () => {
  const now = Date.parse("2026-11-21T12:00:00Z");
  it("marks a disclosure that came after starring, for a day", () => {
    expect(isFresh({ added_at: "2026-11-20T09:00:00.000Z", newest_disclosure_at: "2026-11-21T08:00:00.000Z" }, now)).toBe(true);
    expect(isFresh({ added_at: "2026-11-21T09:00:00.000Z", newest_disclosure_at: "2026-11-21T08:00:00.000Z" }, now)).toBe(false);
    expect(isFresh({ added_at: "2026-11-01T09:00:00.000Z", newest_disclosure_at: "2026-11-19T08:00:00.000Z" }, now)).toBe(false);
    expect(isFresh({ added_at: "2026-11-01T09:00:00.000Z", newest_disclosure_at: null }, now)).toBe(false);
  });
  it("says the age plainly", () => {
    expect(ageWords(null, now)).toBe("Duyurusu yok");
    expect(ageWords("2026-11-21T11:30:00.000Z", now)).toBe("Son duyuru: 30 dakika önce");
    expect(ageWords("2026-11-21T09:00:00.000Z", now)).toBe("Son duyuru: 3 saat önce");
    expect(ageWords("2026-11-20T09:00:00.000Z", now)).toBe("Son duyuru: dün");
  });
});

describe("company words", () => {
  it("says honestly why KAPtan does not follow a company", () => {
    expect(followingSentence({ in_universe: true, known: true, reasons_tr: [] })).toContain("izliyor");
    expect(followingSentence({ in_universe: true, known: true, reasons_tr: [] }, true)).toContain("izliyor");
    expect(followingSentence({ in_universe: true, known: true, reasons_tr: [] }, false)).toMatch(/^Bu şirket izleme listende değil\./);
    expect(followingSentence({ in_universe: false, known: true, reasons_tr: ["Halka açık pay oranı çok düşük."] })).toContain("çok düşük");
    expect(followingSentence({ in_universe: false, known: false, reasons_tr: [] })).toContain("tanımıyor");
  });
  it("never invents a price", () => {
    expect(priceHeadline({ period: "3m", points: [], last_close: null, last_day: null, change_pct: null })).toContain("henüz fiyat kaydım yok");
    expect(lineSummary([])).toContain("Çizecek kadar");
  });
});

describe("the test double", () => {
  const api = () => createMockApi({ db: new MockDb(null), user: MOCK_USER, latencyMs: 0, live: false });
  it("finds a company by a folded name and refuses a code nobody knows", async () => {
    const a = api();
    const found = await a.search("misal enerji");
    expect(found.companies[0]?.ticker).toBe("ORNEK");
    expect((await a.search("a")).companies).toEqual([]);
    await expect(a.company("QQQQQ")).rejects.toMatchObject({ status: 404 });
    const page = await a.company("ornek", "1m");
    expect(page.name).toContain("MİSAL");
    expect(page.price.points.length).toBe(22);
  });
  it("stars and un-stars with an audit record, and a second star changes nothing", async () => {
    const db = new MockDb(null);
    const a = createMockApi({ db, user: MOCK_USER, latencyMs: 0, live: false });
    const before = db.snapshot.auditAppends.length;
    const list = await a.watch("ORNYZ");
    expect(list.map((w) => w.ticker)).toContain("ORNYZ");
    await a.watch("ORNYZ");
    expect(db.snapshot.auditAppends.length).toBe(before + 1);
    expect(db.snapshot.auditAppends.at(-1)?.action).toBe("watchlist.added");
    expect((await a.unwatch("ORNYZ")).map((w) => w.ticker)).not.toContain("ORNYZ");
    expect(db.snapshot.auditAppends.at(-1)?.action).toBe("watchlist.removed");
  });
  it("filters disclosures to the watchlist", async () => {
    const a = createMockApi({ db: new MockDb(null), user: MOCK_USER, latencyMs: 0, live: false });
    const all = await a.disclosures({});
    const mine = await a.disclosures({ scope: "watchlist" });
    expect(mine.length).toBeLessThanOrEqual(all.length);
    expect(mine.every((d) => d.stock_codes.some((c) => ["ORNEK", "KRGCL", "ORNCM"].includes(c)))).toBe(true);
  });
});

describe("period from a link", () => {
  it("takes the key or the button's label, in any case", () => {
    expect(periodFromParam("3m")).toBe("3m");
    expect(periodFromParam("3a")).toBe("3m");
    expect(periodFromParam("1Y")).toBe("1y");
    expect(periodFromParam("Tümü")).toBe("all");
    expect(periodFromParam("tumu")).toBe("all");
    expect(periodFromParam("5y")).toBeNull();
    expect(periodFromParam(null)).toBeNull();
  });
});

describe("closeAgeSentence", () => {
  it("names the close day and never a clock time, so it cannot disagree with Param's live price time", () => {
    expect(closeAgeSentence("2027-01-11", "2027-01-11")).toBe("Fiyatlar bugünün kapanışından. Param, gün içinde daha yeni bir fiyat gösterebilir.");
    expect(closeAgeSentence("2027-01-10", "2027-01-11")).toMatch(/^Fiyatlar dünün kapanışından\./);
    expect(closeAgeSentence("2027-01-08", "2027-01-11")).toMatch(/^Fiyatlar 8 Ocak Cuma kapanışından\./);
  });
});
