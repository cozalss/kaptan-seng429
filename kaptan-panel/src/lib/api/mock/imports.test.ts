import { createMockApi } from "./mock-api";
import { MockDb } from "./db";
import * as sel from "./selectors";
import { csvRows } from "./imports";
import { parseDate, parseNumber, typeKey } from "./import-parse";
import { isApiError } from "../types";
import type { ImportMapping } from "@/lib/domain/imports";

function setup() {
  const db = new MockDb(null, Date.now(), true);
  return { db, api: createMockApi({ db, latencyMs: 0, live: false }) };
}

const MAPPING: ImportMapping = { has_header: true, date: 0, type: 1, ticker: 2, qty: 3, price: 4, commission: 5, amount: 6, types: {} };
const HEADER = ["Tarih", "İşlem", "Hisse", "Adet", "Fiyat", "Komisyon", "Tutar"];
const FILE = [
  HEADER,
  ["11.01.2027", "Para Yatırma", "", "", "", "", "50.000,00"],
  ["11.01.2027", "Alış", "KRGCL", "100", "30,00", "6,00", ""],
  ["11.01.2027", "Satış", "KRGCL", "40", "31,00", "2,48", ""],
];
const body = (rows: string[][], extra: Partial<{ types: ImportMapping["types"] }> = {}) => ({ source: "Midas ekstresi", mapping: { ...MAPPING, ...extra }, number_style: "auto" as const, rows });

async function started() {
  const s = setup();
  await s.api.moveMoney({ kind: "start", amount_try: 100_000 });
  return s;
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (isApiError(e)) return e.code;
    throw e;
  }
  throw new Error("expected an error");
}

describe("reading cells", () => {
  it("reads numbers only when they are clear", () => {
    expect(parseNumber("1.234,56")).toBe(1234.56);
    expect(parseNumber("1,234.56")).toBe(1234.56);
    expect(parseNumber("12,5")).toBe(12.5);
    expect(parseNumber("1.234")).toBeNull();
    expect(parseNumber("1.234", "dot")).toBe(1.234);
    expect(parseNumber("abc")).toBeNull();
  });
  it("reads dates day first and strictly", () => {
    expect(parseDate("12.03.2027")).toBe("2027-03-12");
    expect(parseDate("31.02.2027")).toBeNull();
    expect(parseDate("12.03.27")).toBeNull();
  });
  it("folds Turkish letters in type words", () => {
    expect(typeKey("ALIŞ")).toBe("alis");
    expect(typeKey("Para Çekme!")).toBe("para cekme");
  });
  it("keeps a formula as plain text and honours quotes", () => {
    expect(csvRows('a;b\n"=1+1;x";2\n')[1]).toEqual(["=1+1;x", "2"]);
  });
});

describe("importing a statement", () => {
  it("previews without writing, then writes only what is ticked, as audited rows", async () => {
    const { api, db } = await started();
    const before = sel.bookOf(db.snapshot).cash;
    const p = await api.importPreview(body(FILE));
    expect(p.rows.map((r) => r.status)).toEqual(["new", "new", "new"]);
    expect(sel.bookOf(db.snapshot).cash).toBe(before);
    const done = await api.importApply({ ...body(FILE), selected: [1, 2, 3] });
    expect(done.written).toBe(3);
    expect(sel.bookOf(db.snapshot).cash).toBe(before + 50_000 - (3_000 + 6) + (1_240 - 2.48));
    const actions = db.snapshot.auditAppends.map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["money.deposited", "holding.bought", "holding.sold", "import.applied"]));
  });

  it("adds nothing the second time", async () => {
    const { api, db } = await started();
    await api.importApply({ ...body(FILE), selected: [1, 2, 3] });
    const cash = sel.bookOf(db.snapshot).cash;
    const again = await api.importApply({ ...body(FILE), selected: [1, 2, 3] });
    expect(again.written).toBe(0);
    expect(again.preview.rows.map((r) => r.status)).toEqual(["recorded", "recorded", "recorded"]);
    expect(sel.bookOf(db.snapshot).cash).toBe(cash);
  });

  it("names conflicts and unknown words instead of guessing", async () => {
    const { api } = await started();
    const rows = [HEADER, ["11.01.2027", "Satış", "KRGCL", "5", "30,00", "", ""], ["11.01.2027", "Virman", "", "", "", "", "10,00"], ["11.01.2027", "Alış", "KRGCL", "1.5", "30,00", "", ""]];
    const p = await api.importPreview(body(rows));
    expect(p.rows.map((r) => r.status)).toEqual(["conflict", "invalid", "invalid"]);
    expect(p.unknown_types).toEqual(["virman"]);
    const chosen = await api.importPreview(body(rows, { types: { virman: "deposit" } }));
    expect(chosen.rows[1]?.status).toBe("new");
  });

  it("waits for the starting money", async () => {
    const { api } = setup();
    const p = await api.importPreview(body(FILE));
    expect(p.started).toBe(false);
    expect(p.conflict).toBe(3);
  });

  it("refuses what it must and remembers the mapping per source", async () => {
    const { api } = await started();
    expect(await code(api.importRead(new Blob(["x"]), "x.exe", "Midas"))).toBe("unsupported_type");
    expect(await code(api.importRead(new Blob(["x".repeat(5 * 1024 * 1024 + 1)]), "x.csv", "Midas"))).toBe("too_large");
    expect(await code(api.importRead(new Blob(["a"]), "x.csv", "=cmd"))).toBe("validation");
    const text = FILE.map((r) => r.join(";")).join("\n");
    const first = await api.importRead(new Blob([text]), "x.csv", "Midas ekstresi");
    expect(first.saved_mapping).toBeNull();
    await api.importApply({ ...body(FILE), selected: [] });
    const second = await api.importRead(new Blob([text]), "x.csv", "Midas ekstresi");
    expect(second.saved_mapping?.ticker).toBe(2);
    expect(second.saved_matches).toBe(true);
    expect((await api.importSources()).sources).toEqual(["Midas ekstresi"]);
  });
});
