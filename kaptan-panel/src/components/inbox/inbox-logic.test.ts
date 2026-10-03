import type { DayCounters, DisclosureListItem, Order } from "@/lib/domain";
import {
  activeFilterCount,
  conversion,
  DEFAULT_FILTERS,
  eventCodeOf,
  filledToday,
  filterRows,
  foldTr,
  funnelBarPct,
  funnelStages,
  isTypingTarget,
  istanbulDate,
  llmCostLabel,
  mergeFeed,
  moveSelection,
  preScreenOf,
  routeGroup,
  stageConversions,
  tokensLabel,
  withPatch,
} from "./inbox-logic";

function row(over: Partial<DisclosureListItem> & { disclosure_index: number }): DisclosureListItem {
  return {
    disclosure_oid: "oid",
    stock_codes: [over.primary_ticker ?? "ORNEK"],
    related_stocks: [],
    primary_ticker: "ORNEK",
    company_name: "ÖRNEK ENERJİ A.Ş.",
    disclosure_class: "ODA",
    disclosure_type: "Özel Durum Açıklaması",
    subject: "Özel Durum Açıklaması (Genel)",
    summary: "Özet",
    reason: "NEW",
    related_index: null,
    is_late: false,
    attachment_count: 0,
    has_multilang: false,
    is_noise: false,
    subject_route: "llm",
    subject_map_version: "subject_map.v1",
    published_at: "2027-01-11T10:00:00.000Z",
    first_seen_at: "2027-01-11T10:00:10.000Z",
    available_at: "2027-01-11T10:00:10.000Z",
    ingest_source: "live",
    classification: null,
    run_id: null,
    linked_news_count: 0,
    note_count: 0,
    ...over,
  };
}

const ROWS = [
  row({ disclosure_index: 1, primary_ticker: "ORNEK", stock_codes: ["ORNEK"], classification: { event_type: "E3", confidence: 0.93, method: "llm" } }),
  row({ disclosure_index: 2, primary_ticker: "KRGCL", stock_codes: ["KRGCL"], company_name: "KURGU ÇELİK A.Ş.", subject_route: "E1", disclosure_class: "ODA", classification: { event_type: "E1", confidence: 0.98, method: "subject_map" } }),
  row({ disclosure_index: 3, primary_ticker: "DMOGD", stock_codes: ["DMOGD"], company_name: "DEMO GIDA A.Ş.", is_noise: true, subject_route: "noise", disclosure_class: "DUY", subject: "Devre Kesici Uygulanması" }),
  row({ disclosure_index: 4, primary_ticker: "TMSLJ", stock_codes: ["TMSLJ"], company_name: "TEMSİLİ LOJİSTİK A.Ş.", subject_route: "avoid:measure", classification: { event_type: "FILTER", confidence: 1, method: "subject_map" } }),
  row({ disclosure_index: 5, primary_ticker: "TMSPZ", stock_codes: ["TMSPZ"], company_name: "TEMSİLİ PAZARLAMA A.Ş.", subject_route: "archive_only", disclosure_class: "FR", classification: { event_type: "IGNORE", confidence: 1, method: "subject_map" } }),
];

const ids = (rs: DisclosureListItem[]) => rs.map((r) => r.disclosure_index);

describe("inbox filters", () => {
  it("hides circuit-breaker noise by default and shows it on request", () => {
    expect(ids(filterRows(ROWS, DEFAULT_FILTERS))).toEqual([1, 2, 4, 5]);
    expect(ids(filterRows(ROWS, { ...DEFAULT_FILTERS, showNoise: true }))).toEqual([1, 2, 3, 4, 5]);
    expect(ids(filterRows(ROWS, { ...DEFAULT_FILTERS, route: "noise" }))).toEqual([3]);
  });

  it("filters by E-code including the X/O mapping and unclassified rows", () => {
    expect(ids(filterRows(ROWS, { ...DEFAULT_FILTERS, event: "E3" }))).toEqual([1]);
    expect(ids(filterRows(ROWS, { ...DEFAULT_FILTERS, event: "X" }))).toEqual([4]);
    expect(ids(filterRows(ROWS, { ...DEFAULT_FILTERS, event: "O" }))).toEqual([5]);
    expect(ids(filterRows(ROWS, { ...DEFAULT_FILTERS, event: "none", showNoise: true }))).toEqual([3]);
  });

  it("filters by disclosure class and route group", () => {
    expect(ids(filterRows(ROWS, { ...DEFAULT_FILTERS, cls: "FR" }))).toEqual([5]);
    expect(ids(filterRows(ROWS, { ...DEFAULT_FILTERS, route: "event" }))).toEqual([2]);
    expect(ids(filterRows(ROWS, { ...DEFAULT_FILTERS, route: "avoid" }))).toEqual([4]);
    expect(ids(filterRows(ROWS, { ...DEFAULT_FILTERS, route: "llm" }))).toEqual([1]);
    expect(ids(filterRows(ROWS, { ...DEFAULT_FILTERS, route: "archive" }))).toEqual([5]);
  });

  it("searches ticker, company and subject Turkish-insensitively", () => {
    expect(ids(filterRows(ROWS, { ...DEFAULT_FILTERS, q: "krgcl" }))).toEqual([2]);
    expect(ids(filterRows(ROWS, { ...DEFAULT_FILTERS, q: "kurgu celik" }))).toEqual([2]);
    expect(ids(filterRows(ROWS, { ...DEFAULT_FILTERS, q: "ornek enerji" }))).toEqual([1]);
    expect(filterRows(ROWS, { ...DEFAULT_FILTERS, q: "yok-boyle-bir-sey" })).toEqual([]);
  });

  it("folds Turkish letters and counts active filters", () => {
    expect(foldTr("ÇİĞDEM IŞIK Ö")).toBe("cigdem isik o");
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, q: "x", event: "E1", showNoise: true })).toBe(3);
  });

  it("groups routes and maps event codes", () => {
    expect(routeGroup("E2")).toBe("event");
    expect(routeGroup("avoid:bonus_issue")).toBe("avoid");
    expect(eventCodeOf("FILTER")).toBe("X");
    expect(eventCodeOf("IGNORE")).toBe("O");
    expect(eventCodeOf("E4")).toBe("E4");
    expect(eventCodeOf(null)).toBeNull();
  });
});

describe("live feed merge", () => {
  it("puts arrivals on top, lets a later fetch win and applies patches", () => {
    const late = row({ disclosure_index: 9, published_at: "2027-01-11T10:41:00.000Z" });
    const merged = mergeFeed(ROWS.slice(0, 2), [late], new Map());
    expect(ids(merged)).toEqual([9, 2, 1]);
    const refetched = { ...late, note_count: 2 };
    expect(mergeFeed([refetched], [late], new Map())[0]?.note_count).toBe(2);

    let patches = withPatch(new Map(), 9, { classification: { event_type: "E3", confidence: 0.93, method: "llm" } });
    patches = withPatch(patches, 9, { linked_news_count: 4 });
    const patched = mergeFeed([], [late], patches)[0];
    expect(patched?.classification?.event_type).toBe("E3");
    expect(patched?.linked_news_count).toBe(4);
  });

  it("does not mutate the previous patch map", () => {
    const a = new Map();
    const b = withPatch(a, 1, { linked_news_count: 1 });
    expect(a.size).toBe(0);
    expect(b.get(1)).toEqual({ linked_news_count: 1 });
  });
});

const COUNTERS: DayCounters = {
  as_of: "2027-01-11T10:40:00.000Z",
  total: 212,
  noise: 61,
  archived: 138,
  processed: 13,
  e_candidates: 11,
  proposals: 5,
  approvals: 1,
  rejections: 1,
  llm_calls: 31,
  llm_tokens: 412_000,
};

describe("funnel and cost", () => {
  it("builds the seven pipeline stages from the day counters", () => {
    const s = funnelStages(COUNTERS, 1);
    expect(s.map((x) => x.value)).toEqual([212, 199, 13, 11, 5, 1, 1]);
    expect(s[1]?.exit).toBe(true);
    expect(s[1]?.hint).toContain("LLM çağrısı 0");
    const c = stageConversions(s);
    expect(c[0]).toBeNull();
    expect(c[1]).toBeCloseTo(199 / 212, 3);
    expect(c[2]).toBeCloseTo(13 / 212, 3);
    expect(c[3]).toBeCloseTo(11 / 13, 3);
  });

  it("scales bars by square root with a visible floor", () => {
    expect(funnelBarPct(212, 212)).toBe(100);
    expect(funnelBarPct(1, 212)).toBeGreaterThanOrEqual(4);
    expect(funnelBarPct(0, 212)).toBe(0);
    expect(funnelBarPct(5, 0)).toBe(0);
    expect(conversion(13, 212)).toBeCloseTo(0.0613, 3);
    expect(conversion(1, 0)).toBeNull();
  });

  it("labels LLM cost the way the demo says it", () => {
    expect(tokensLabel(412_000)).toBe("~0,4M");
    expect(tokensLabel(48_000)).toBe("~48B");
    expect(llmCostLabel(COUNTERS)).toBe("Bugün: 31 çağrı · ~0,4M token");
  });

  it("counts orders filled on the counters' Istanbul day", () => {
    const fill = (at: string) => ({ id: at, order_id: "o", qty: 1, price: 1, commission: 0, bsmv: 0, slippage_bps: 0, filled_at: at, source: "simbist" as const });
    const order = (fills: ReturnType<typeof fill>[]) => ({ fills }) as unknown as Order;
    expect(istanbulDate("2027-01-10T22:30:00.000Z")).toBe("2027-01-11");
    expect(filledToday([order([fill("2027-01-11T06:55:00.000Z")]), order([fill("2027-01-08T06:55:00.000Z")]), order([])], COUNTERS.as_of)).toBe(1);
  });
});

describe("keyboard triage", () => {
  it("moves through ids and clamps at both ends", () => {
    const list = [10, 20, 30];
    expect(moveSelection(list, null, 1)).toBe(10);
    expect(moveSelection(list, null, -1)).toBe(30);
    expect(moveSelection(list, 10, 1)).toBe(20);
    expect(moveSelection(list, 30, 1)).toBe(30);
    expect(moveSelection(list, 10, -1)).toBe(10);
    expect(moveSelection(list, 99, 1)).toBe(10);
    expect(moveSelection([], 1, 1)).toBeNull();
  });

  it("recognises text fields", () => {
    expect(isTypingTarget(document.createElement("input"))).toBe(true);
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("pre-screen explanation", () => {
  it("names the reason code and whether an LLM was called", () => {
    expect(preScreenOf(ROWS[2] as DisclosureListItem)).toMatchObject({ code: "noise", llmCalls: "0" });
    expect(preScreenOf(ROWS[3] as DisclosureListItem)).toMatchObject({ code: "avoid:measure", llmCalls: "0", label: "Kaçınma filtresi" });
    expect(preScreenOf(ROWS[4] as DisclosureListItem)).toMatchObject({ label: "Arşivlendi", llmCalls: "0" });
    expect(preScreenOf(ROWS[0] as DisclosureListItem)).toMatchObject({ llmCalls: "≥ 1", label: "LLM'e gitti" });
    expect(preScreenOf(ROWS[1] as DisclosureListItem).detail).toContain("subject_map.v1");
  });
});
